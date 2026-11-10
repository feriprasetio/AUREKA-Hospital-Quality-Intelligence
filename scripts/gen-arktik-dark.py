#!/usr/bin/env python3
"""Generate app/theme-arktik-dark.css (Arktik gelap / "Kaca Malam").

Re-emits every colour declaration of the existing stylesheets, scoped with
:where(html[data-skin="arktik"][data-mode="gelap"]) (same specificity as the
original rule, file loaded later so it wins ties), with colours remapped:

- brand green -> arctic blue first (same as theme-arktik-accents)
- text (color/fill/stroke): dark ink becomes light, keeping hue
- surfaces (backgrounds): white/near-white -> translucent white glass on dark,
  light tints -> deep tinted glass, dark fills (navy buttons) -> bright blue
- borders: light lines -> translucent white lines
- vivid mid-tone semantic colours (risk levels, status) are kept

Run: python3 scripts/gen-arktik-dark.py   (rerun after editing app/*.css)
"""
import colorsys
import importlib.util
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('acc', ROOT / 'scripts' / 'gen-arktik-accents.py')
acc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acc)

APP = ROOT / 'app'
OUT = APP / 'theme-arktik-dark.css'
SKIP_FILES = {'theme-arktik.css', 'theme-arktik-accents.css', 'theme-arktik-dark.css', 'survey-wizard.css'}
SKIP_SELECTOR = re.compile(r'amoled|data-theme="dark"|a2-|authPage|landing|publicLanding', re.I)
PROPS = acc.PROPS
HEX = acc.HEX
RGB = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)')
NAMED = re.compile(r'(?<![\w-])(white|black|#fff\b|#000\b)(?![\w-])', re.I)
TEXT_PROPS = re.compile(r'^(color|fill|stroke|caret-color|text-decoration-color|accent-color)$')
BORDER_PROPS = re.compile(r'^(border(-[\w-]+)?|outline(-color)?|column-rule-color)$')
TEXT_VAR = re.compile(r'ink|text|muted|fg|foreground|heading|title|label|copy', re.I)
SURFACE_VAR = re.compile(r'bg|surface|canvas|card|panel|soft|page|glass|backdrop|row|stripe|hover', re.I)
LINE_VAR = re.compile(r'line|border|divider|rule|stroke-soft|outline', re.I)
PREFIX = ':where(html[data-skin="arktik"][data-mode="gelap"])'


def green_to_blue(r, g, b):
    out = acc.shift(r, g, b)
    return out if out else (r, g, b)


def fmt(r, g, b, a):
    if a is None or a >= 0.999:
        return '#%02x%02x%02x' % (round(r), round(g), round(b))
    return 'rgba(%d, %d, %d, %s)' % (round(r), round(g), round(b), ('%.3f' % a).rstrip('0').rstrip('.'))


def hls(r, g, b):
    return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)


def rgb_from(h, l, s):
    r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s)))
    return r * 255, g * 255, b * 255


def map_text(r, g, b, a):
    h, l, s = hls(r, g, b)
    if l < 0.62:
        if s > 0.45 and l > 0.32:          # vivid semantic text (red/amber/blue) -> lighter, still coloured
            return fmt(*rgb_from(h, min(0.78, l + 0.24), s * 0.9), a)
        return fmt(*rgb_from(h, 0.95 - l * 0.45, min(s, 0.35)), a)
    return None


def map_surface(r, g, b, a):
    h, l, s = hls(r, g, b)
    alpha = 1.0 if a is None else a
    if l >= 0.9:                            # white / near-white surfaces -> glass
        return fmt(255, 255, 255, round(0.07 * alpha, 3))
    if l >= 0.72:                           # light tints -> deep tinted glass
        if s > 0.25:
            return fmt(*rgb_from(h, 0.32, min(0.6, s)), round(0.35 * alpha, 3))
        return fmt(255, 255, 255, round(0.1 * alpha, 3))
    if l <= 0.3 and (s < 0.5 or 190 <= h * 360 <= 230):   # dark fills (navy/ink buttons) -> bright blue
        return fmt(*rgb_from(208 / 360, 0.56, 0.62), alpha if a is not None else None)
    return None                              # vivid mid-tones (risk colours etc.) kept


def map_border(r, g, b, a):
    h, l, s = hls(r, g, b)
    alpha = 1.0 if a is None else a
    if l >= 0.7 and s < 0.5:
        return fmt(255, 255, 255, round(0.14 * alpha, 3))
    if l >= 0.7:
        return fmt(*rgb_from(h, 0.45, s), round(0.5 * alpha, 3))
    if l <= 0.3:
        return fmt(255, 255, 255, round(0.18 * alpha, 3))
    return None


def map_shadow(r, g, b, a):
    h, l, s = hls(r, g, b)
    if l >= 0.85:   # light glow / inset highlight -> subtle
        return fmt(255, 255, 255, round(0.08 * (1.0 if a is None else a), 3))
    return fmt(0, 0, 0, min(0.5, (0.2 if a is None else a) * 2.2))


def mapper_for(prop):
    if TEXT_PROPS.match(prop):
        return map_text
    if BORDER_PROPS.match(prop):
        return map_border
    if prop in ('box-shadow', 'text-shadow'):
        return map_shadow
    if prop.startswith('--'):
        if TEXT_VAR.search(prop):
            return map_text
        if LINE_VAR.search(prop):
            return map_border
        if SURFACE_VAR.search(prop):
            return map_surface
        return map_accent_var
    return map_surface


def map_accent_var(r, g, b, a):
    h, l, s = hls(r, g, b)
    if l <= 0.35:
        return fmt(*rgb_from(h, 0.62, min(0.75, s + 0.1)), a)
    if l >= 0.9:
        return fmt(255, 255, 255, round(0.07 * (1.0 if a is None else a), 3))
    if l >= 0.75:
        return fmt(*rgb_from(h, 0.3, min(0.6, s)), a)
    return None


def remap(prop, value):
    fn = mapper_for(prop)
    changed = False

    def apply(r, g, b, a):
        nonlocal changed
        r, g, b = green_to_blue(r, g, b)
        out = fn(r, g, b, a)
        if out is None:
            return None
        changed = True
        return out

    def hex_sub(m):
        hx = m.group(1)
        if len(hx) in (3, 4):
            hx = ''.join(c * 2 for c in hx)
        a = int(hx[6:8], 16) / 255 if len(hx) == 8 else None
        out = apply(int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16), a)
        return out or m.group(0)

    def rgb_sub(m):
        a = float(m.group(4)) if m.group(4) else None
        out = apply(int(m.group(1)), int(m.group(2)), int(m.group(3)), a)
        return out or m.group(0)

    def named_sub(m):
        w = m.group(1).lower()
        val = (255, 255, 255) if w in ('white', '#fff') else (0, 0, 0)
        out = apply(*val, None)
        return out or m.group(0)

    v = HEX.sub(hex_sub, value)
    v = RGB.sub(rgb_sub, v)
    v = NAMED.sub(named_sub, v)
    t = acc.TRIPLE.match(v)
    if t and prop.startswith('--'):       # --accent-rgb style triples
        out = apply(int(t.group(1)), int(t.group(2)), int(t.group(3)), None)
        if out and out.startswith('#'):
            v = '%d, %d, %d' % tuple(int(out[i:i + 2], 16) for i in (1, 3, 5))
    return v if changed else None


def scope(sel):
    sel = sel.strip()
    if not sel or SKIP_SELECTOR.search(sel):
        return None
    if sel.startswith(':root'):
        return ':root:where([data-skin="arktik"][data-mode="gelap"])' + sel[5:]
    if sel.startswith('html'):
        return 'html:where([data-skin="arktik"][data-mode="gelap"])' + sel[4:] if not sel[4:5].isalnum() else None
    return f'{PREFIX} {sel}'


def rules(css):
    lines = []
    for prelude, body in acc.blocks(css):
        if prelude.startswith('@media') or prelude.startswith('@supports'):
            if 'prefers-color-scheme' in prelude or 'print' in prelude:
                continue
            inner = rules(body)
            if inner:
                lines.append(prelude + ' {\n' + '\n'.join('  ' + l for l in inner) + '\n}')
            continue
        if prelude.startswith('@'):
            continue
        decls = []
        for d in acc.split_decls(body):
            if ':' not in d:
                continue
            prop, val = d.split(':', 1)
            prop = prop.strip()
            if not PROPS.match(prop):
                continue
            val = val.strip()
            imp = '!important' in val
            val = val.replace('!important', '').strip()
            new = remap(prop, val)
            if new:
                decls.append(f'{prop}: {new}{" !important" if imp else ""};')
        if not decls:
            continue
        sels = [s for s in (scope(x) for x in acc.split_selectors(prelude)) if s]
        if not sels:
            continue
        lines.append(',\n'.join(sels) + ' { ' + ' '.join(decls) + ' }')
    return lines


def main():
    out = ['/* GENERATED by scripts/gen-arktik-dark.py — do not edit by hand. */',
           '/* Arktik gelap: aktif bila html[data-skin="arktik"][data-mode="gelap"]. */']
    total = 0
    for f in sorted(APP.glob('*.css')):
        if f.name in SKIP_FILES:
            continue
        r = rules(acc.strip_comments(f.read_text()))
        if r:
            out.append(f'\n/* from {f.name} */')
            out.extend(r)
            total += len(r)
    for name, css in acc.component_css():
        # <style> komponen dimuat setelah CSS global, jadi butuh spesifisitas sedikit lebih tinggi
        r = [line.replace(':where(html[data-skin="arktik"][data-mode="gelap"])', 'html[data-skin="arktik"][data-mode="gelap"]') for line in rules(acc.strip_comments(css))]
        if r:
            out.append(f'\n/* from {name} */')
            out.extend(r)
            total += len(r)
    OUT.write_text('\n'.join(out) + '\n')
    print(f'{total} rules -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
