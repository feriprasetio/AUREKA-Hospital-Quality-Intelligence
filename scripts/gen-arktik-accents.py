#!/usr/bin/env python3
"""Generate app/theme-arktik-accents.css.

The Arktik (glass) theme is blue; the older stylesheets hard-code the brand
green in hundreds of places. This script finds every declaration that uses a
brand-green colour and re-emits it, scoped to html[data-skin="arktik"], with the
green hue rotated to arctic blue (lightness and saturation kept), so the theme
looks consistent without touching the original stylesheets.

Semantic greens are left alone: success / "rendah" risk colours sit below the
hue window, and selectors that look status-related are skipped.

Run: python3 scripts/gen-arktik-accents.py   (rerun after editing app/*.css)
"""
import colorsys
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
OUT = APP / 'theme-arktik-accents.css'
SKIP_FILES = {'theme-arktik.css', 'theme-arktik-accents.css', 'theme-arktik-dark.css', 'survey-wizard.css'}
SKIP_SELECTOR = re.compile(r'amoled|data-theme="dark"|risk|success|rendah|low\b|lowRisk|ok\b|good|valid|pass|safe|aman|done|complete|selesai|positive|up\b|trend|status|badge|pill|level|band|matrix|heat|cell', re.I)
PROPS = re.compile(r'^(--[\w-]+|color|background(-color|-image)?|border(-[\w-]+)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|accent-color|caret-color|text-decoration-color|column-rule-color)$')
HUE_MIN, HUE_MAX, SAT_MIN = 135, 180, 0.08
TARGET_HUE = 208
PREFIX = 'html[data-skin="arktik"]'

HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b')
RGB = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+\s*)?\)')
TRIPLE = re.compile(r'^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$')  # --accent-rgb: 15,118,86


def shift(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    deg = h * 360
    in_brand = s >= SAT_MIN and HUE_MIN <= deg <= HUE_MAX
    # sage / olive tints (light or greyish greens) used as surfaces and muted text
    in_tint = 75 <= deg < HUE_MIN and s >= 0.05 and (l >= 0.86 or s <= 0.3)
    if not (in_brand or in_tint):
        return None
    # slightly more saturation for the mid tones so blue does not look grey
    s2 = min(1.0, s * 1.08)
    r2, g2, b2 = colorsys.hls_to_rgb(TARGET_HUE / 360, l, s2)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def recolor(value):
    changed = False

    def hex_sub(m):
        nonlocal changed
        h = m.group(1)
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        alpha = h[6:]
        out = shift(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        if not out:
            return m.group(0)
        changed = True
        return '#%02x%02x%02x' % out + alpha

    def rgb_sub(m):
        nonlocal changed
        out = shift(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if not out:
            return m.group(0)
        changed = True
        alpha = m.group(4)
        return ('rgba(%d, %d, %d%s)' % (*out, alpha)) if alpha else ('rgb(%d, %d, %d)' % out)

    v = HEX.sub(hex_sub, value)
    v = RGB.sub(rgb_sub, v)
    t = TRIPLE.match(v)
    if t:
        out = shift(int(t.group(1)), int(t.group(2)), int(t.group(3)))
        if out:
            changed = True
            v = '%d, %d, %d' % out
    return v if changed else None


def scope(sel):
    # :where() keeps the original specificity, so the cascade between the
    # original rules is preserved; this file loads later, so it wins ties.
    sel = sel.strip()
    if not sel or SKIP_SELECTOR.search(sel):
        return None
    if sel.startswith(':root'):
        return ':root:where([data-skin="arktik"])' + sel[5:]
    if sel.startswith('html'):
        return 'html:where([data-skin="arktik"])' + sel[4:] if not sel[4:5].isalnum() else None
    if sel.startswith('body'):
        return f':where(html[data-skin="arktik"]) {sel}'
    return f':where(html[data-skin="arktik"]) {sel}'


def split_selectors(prelude):
    out, buf, depth = [], '', 0
    for ch in prelude:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(buf)
            buf = ''
        else:
            buf += ch
    out.append(buf)
    return out


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def blocks(css):
    """Yield (prelude, body) for top-level blocks."""
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            return
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
            k += 1
        yield css[i:j].strip(), css[j + 1:k - 1]
        i = k


def split_decls(body):
    out, buf, depth = [], '', 0
    for ch in body:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ';' and depth == 0:
            out.append(buf)
            buf = ''
        else:
            buf += ch
    if buf.strip():
        out.append(buf)
    return out


def rules(css):
    lines = []
    for prelude, body in blocks(css):
        if prelude.startswith('@media') or prelude.startswith('@supports'):
            inner = rules(body)
            if inner:
                lines.append(prelude + ' {\n' + '\n'.join('  ' + l for l in inner) + '\n}')
            continue
        if prelude.startswith('@'):
            continue
        decls = []
        for d in split_decls(body):
            if ':' not in d:
                continue
            prop, val = d.split(':', 1)
            prop = prop.strip()
            if not PROPS.match(prop):
                continue
            val = val.strip()
            imp = '!important' in val
            val = val.replace('!important', '').strip()
            new = recolor(val)
            if new:
                decls.append(f'{prop}: {new}{" !important" if imp else ""};')
        if not decls:
            continue
        sels = [s for s in (scope(x) for x in split_selectors(prelude)) if s]
        if not sels:
            continue
        lines.append(',\n'.join(sels) + ' { ' + ' '.join(decls) + ' }')
    return lines


def component_css():
    """CSS embedded in components as template strings (not styled-jsx, whose
    selectors get hashed and cannot be matched from outside)."""
    out = []
    for f in sorted((ROOT / 'components').rglob('*.tsx')):
        src = f.read_text()
        if '<style jsx' in src:
            continue
        for block in re.findall(r'`([^`]*\{[^`]*\}[^`]*)`', src):
            if '${' in block or len(block) < 200:
                continue
            if not re.search(r'[.#][A-Za-z][\w-]*[^{};]*\{[^{}]*:[^{}]*', block):
                continue
            out.append((f.relative_to(ROOT).as_posix(), block))
    return out


def main():
    out = ['/* GENERATED by scripts/gen-arktik-accents.py — do not edit by hand. */',
           '/* Brand green -> arctic blue for html[data-skin="arktik"]; semantic greens untouched. */']
    total = 0
    for f in sorted(APP.glob('*.css')):
        if f.name in SKIP_FILES:
            continue
        r = rules(strip_comments(f.read_text()))
        if r:
            out.append(f'\n/* from {f.name} */')
            out.extend(r)
            total += len(r)
    for name, css in component_css():
        # <style> komponen dimuat setelah CSS global, jadi butuh spesifisitas sedikit lebih tinggi
        r = [line.replace(':where(html[data-skin="arktik"])', 'html[data-skin="arktik"]') for line in rules(strip_comments(css))]
        if r:
            out.append(f'\n/* from {name} */')
            out.extend(r)
            total += len(r)
    OUT.write_text('\n'.join(out) + '\n')
    print(f'{total} rules -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
