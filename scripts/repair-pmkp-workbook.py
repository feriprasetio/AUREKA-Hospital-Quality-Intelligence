#!/usr/bin/env python3
"""Repair reviewed formula patterns in copies of the 2026 PMKP templates."""
import argparse
from collections import Counter
from datetime import date
from html import escape, unescape
from itertools import groupby
import json
import math
from pathlib import Path
import re
from unicodedata import normalize
from zipfile import ZipFile

from openpyxl import load_workbook


CELL = re.compile(r'<c\b(?P<attrs>[^<>]*?\br="(?P<address>[A-Z]+[0-9]+)"[^<>]*?)(?<!/)>(?P<body>.*?)</c>', re.S)
FORMULA = re.compile(r'<f(?P<attributes>[^>]*)>(?P<text>.*?)</f>', re.S)
VALUE = re.compile(r'<v\b[^>]*>.*?</v>|<v\s*/>', re.S)
DIAGNOSIS_FORMULA = re.compile(r'LOWER\(SUBSTITUTE\(#REF!,\s*" ",\s*""\)\)')
IGD_DURATION_FORMULA = (
    'IF(COUNTBLANK(Table2[[#This Row],[Waktu Transfer]])=0,'
    'Table2[[#This Row],[Waktu Transfer]]-Table2[[#This Row],[Waktu Masuk]],"")'
)


def normalized(value):
    return ' '.join(normalize('NFKC', str(value or '')).casefold().split())


def outpatient_inputs(workbook):
    """Resolve provider rows against the same roster as AUREKA's matrix importer."""
    data = workbook['Logbook']
    first_date = data['B1'].value
    if normalized(data['A1'].value) != 'poliklinik' or not hasattr(first_date, 'date') or first_date.date() != date(2026, 1, 1):
        raise ValueError('Format matriks Rawat Jalan tidak sesuai sumber 2026.')
    layout_path = Path(__file__).resolve().parents[1] / 'data' / 'quality-audit-layout-2026.json'
    layouts = json.loads(layout_path.read_text())
    groups = next(layout['providerGroups'] for layout in layouts if layout['roomId'] == 11)
    roster = {normalized(group['clinic']): {normalized(name) for name in group['doctors']} for group in groups}
    dates = next(data.iter_rows(min_row=1, max_row=1, min_col=2, max_col=367, values_only=True))
    day_offsets = [(value.date() - first_date.date()).days if hasattr(value, 'date') else None for value in dates]
    active = set()
    provider_rows = set()
    counts = Counter()
    below = Counter()
    for index, row in enumerate(data.iter_rows(min_row=3, max_row=93, max_col=367, values_only=True), 3):
        label = normalized(row[0])
        if label in roster:
            active = roster[label]
            continue
        if not label:
            continue
        if label not in active:
            if any(type(value) in (int, float) for value in row[1:]):
                raise ValueError(f'Baris matriks {index} berisi angka dengan dokter yang belum terpetakan.')
            continue
        provider_rows.add(index)
        for day, value in zip(day_offsets, row[1:]):
            if day is None or type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1440:
                continue
            counts[day] += 1
            if value < 60:
                below[day] += 1
    if not provider_rows:
        raise ValueError('Baris pengukuran Rawat Jalan tidak ditemukan.')
    blocks = []
    for _, block in groupby(enumerate(sorted(provider_rows)), lambda item: item[1] - item[0]):
        rows = [item[1] for item in block]
        blocks.append((rows[0], rows[-1]))
    return blocks, counts, below


def outpatient_formula(row, blocks, numerator):
    column = f'MATCH(B{row},Logbook!$B$1:$NC$1,0)'
    expressions = []
    for first, last in blocks:
        data = f'INDEX(Logbook!$B${first}:$NC${last},0,{column})'
        limit = f'*({data}<60)' if numerator else ''
        expressions.append(f'SUMPRODUCT(IFERROR(ISNUMBER({data})*({data}>=0)*({data}<=1440){limit},0))')
    return 'IFERROR(SUM(' + ','.join(expressions) + '),0)'


def repair_sheet(xml, decide):
    changes = Counter()

    def replace_cell(match):
        address, attrs, body = match['address'], match['attrs'], match['body']
        original = FORMULA.search(body)
        if not original or ' t=' in original['attributes'] or original['attributes'].endswith('/'):
            return match.group()
        patch = decide(address, unescape(original['text']))
        if patch is None:
            return match.group()
        category, formula, cache = patch
        formula_xml = '<f' + original['attributes'] + '>' + escape(formula, quote=False) + '</f>'
        body = body[:original.start()] + formula_xml + body[original.end():]
        body = VALUE.sub('', body, count=1)
        if cache is not None:
            body += f'<v>{cache}</v>'
        attrs = re.sub(r'\s+t="(?:e|str|n)"', '', attrs)
        changes[category] += 1
        return '<c' + attrs + '>' + body + '</c>'

    return CELL.sub(replace_cell, xml), changes


def build_rules(source, workbook):
    name = normalized(source.name)
    rules = {}
    if any(unit in name for unit in ('rawat inap saraf', 'rawat inap vip', 'isolasi', 'verlos kamer')):
        logbook = workbook['Logbook']
        if normalized(logbook['F2'].value) == 'diagnosa tegak':
            rules[logbook._worksheet_path] = lambda addr, formula: (
                ('Rujukan diagnosis', formula.replace('#REF!', 'F' + addr[2:]), None)
                if addr.startswith('AG') and DIAGNOSIS_FORMULA.fullmatch(formula) else None
            )
    if 'instalasi gawat darurat' in name:
        logbook = workbook['Logbook']
        if [normalized(logbook[key].value) for key in ('E3', 'F3', 'T3')] == ['waktu masuk', 'waktu transfer', 'selisih']:
            rules[logbook._worksheet_path] = lambda addr, formula: (
                ('Durasi transfer IGD', f'IF(AND(ISNUMBER(E{addr[1:]}),ISNUMBER(F{addr[1:]}),F{addr[1:]}>=E{addr[1:]}),F{addr[1:]}-E{addr[1:]},"")', None)
                if re.fullmatch(r'T[0-9]+', addr) and formula == IGD_DURATION_FORMULA else None
            )
    if 'timkordik' in name:
        logbook = workbook['Logbook']
        dashboard = workbook['Dashboard']
        if normalized(logbook['E2'].value) == 'stase':
            labels = {
                row for row, values in enumerate(dashboard.iter_rows(min_row=11, max_row=100, min_col=17, max_col=17, values_only=True), 11)
                if isinstance(values[0], str) and values[0].strip()
            }

            def correct_stage_count(addr, formula):
                if not re.fullmatch(r'R[0-9]+', addr) or int(addr[1:]) not in labels:
                    return None
                if not re.fullmatch(r'COUNTIF\(Logbook!\$E:\$E,Dashboard!(?:Q[0-9]+|#REF!)\)', formula):
                    return None
                expected = f'COUNTIF(Logbook!$E:$E,Dashboard!Q{addr[1:]})'
                return ('Rekap stase Timkordik', expected, None) if formula != expected else None

            rules[dashboard._worksheet_path] = correct_stage_count
    if 'instalasi laboratorium' in name:
        logbook = workbook['Logbook']

        def correct_lab_count(addr, formula):
            if not re.fullmatch(r'AF[0-9]+', addr):
                return None
            if not re.fullmatch(r'IF\(COUNTBLANK\((E[0-9]+|#REF!)\)=0,VALUE\(SUBSTITUTE\(\1,",",""\)\),""\)', formula):
                return None
            field = 'E' + addr[2:]
            expected = f'IF(COUNTBLANK({field})=0,VALUE(SUBSTITUTE({field},",","")),"")'
            return ('Rujukan angka Laboratorium', expected, None) if formula != expected else None

        rules[logbook._worksheet_path] = correct_lab_count
    if any(unit in name for unit in ('instalasi bedah sentral', 'emergensi komprehensi', 'instalasi gizi')):
        dashboard = workbook['Dashboard']

        def mark_unavailable(address, formula):
            if 'Logbook!#REF!' not in formula:
                return None
            # A deleted source column cannot be recovered from the surviving report.
            # Put a status in the report instead of producing a zero or a false count.
            return ('Rekap tanpa kolom sumber', '"Kolom sumber tidak tersedia"', None)

        rules[dashboard._worksheet_path] = mark_unavailable
        if 'instalasi gizi' in name:
            rules[workbook['20']._worksheet_path] = mark_unavailable
    if 'instalasi rawat jalan' in name:
        blocks, counts, below = outpatient_inputs(workbook)

        def outpatient_report(addr, formula):
            if not re.fullmatch(r'[CD][0-9]+', addr) or '_xlfn.XLOOKUP(' not in formula:
                return None
            row = int(addr[1:])
            numerator = addr.startswith('C')
            cache = (below if numerator else counts)[row - 3]
            return ('Rekap harian Rawat Jalan', outpatient_formula(row, blocks, numerator), cache)

        rules[workbook['1']._worksheet_path] = outpatient_report
    return rules


def repair(source, destination):
    workbook = load_workbook(source, read_only=True, data_only=True)
    try:
        rules = build_rules(source, workbook)
    finally:
        workbook.close()
    if not rules:
        return Counter()

    changed = {}
    totals = Counter()
    with ZipFile(source) as original:
        for path, rule in rules.items():
            xml, counts = repair_sheet(original.read(path).decode('utf-8'), rule)
            if counts:
                changed[path] = xml
                totals.update(counts)
        if not totals:
            return totals
        # Preserve drawings, relationships, shared strings, styles and untouched sheets.
        # Recompute all formulas on the next workbook open so dependent caches refresh.
        workbook_path = 'xl/workbook.xml'
        workbook_xml = original.read(workbook_path).decode('utf-8')
        if '<calcPr' in workbook_xml:
            def force_calc(match):
                tag = re.sub(r'\s+(?:fullCalcOnLoad|forceFullCalc)="[^"]*"', '', match[0])
                return re.sub(r'\s*/?>$', lambda end: ' fullCalcOnLoad="1" forceFullCalc="1"' + end[0], tag)
            workbook_xml = re.sub(r'<calcPr\b[^>]*>', force_calc, workbook_xml, count=1)
        else:
            workbook_xml = workbook_xml.replace('</workbook>', '<calcPr fullCalcOnLoad="1" forceFullCalc="1"/></workbook>')
        changed[workbook_path] = workbook_xml
        with destination.open('xb') as stream, ZipFile(stream, 'w') as output:
            for item in original.infolist():
                content = changed.get(item.filename)
                output.writestr(item, content.encode('utf-8') if content is not None else original.read(item))
    return totals


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='Direktori terpisah untuk salinan yang diperbaiki')
    parser.add_argument('workbooks', type=Path, nargs='+')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for source in args.workbooks:
        if source.suffix.lower() != '.xlsx':
            parser.error('Berkas harus berbentuk XLSX: ' + source.name)
        changes = repair(source, args.output / source.name)
        print(json.dumps({'workbook': source.name, 'rumus_diperbaiki': dict(changes)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
