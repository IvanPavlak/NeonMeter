"""Draws the README graphics: hero.svg (the band on both themes), palette.svg
(the six ranges) title-dark.svg / title-light.svg (the glowing name and tagline) and
terminal.svg (the terminal band in every look and at three widths on both themes, from the
builder's own rows in terminal-rows.json). Pure SVG with the same glow the desktop band draws: a blurred
halo of each color under every filled bar, dot and percent.

The drawings hold still; only the Weekly segment takes its turns with the Fable limit, every
5 s, as the band does, and the single layout's row takes its turns through every segment. The band's 800 ms pulse is deliberately not here. A browser shows these
files through <img>, and whenever any value in such an SVG changes it rasterizes the whole image
again in software, blur or no blur. Measured in Firefox's GPU process, the pulse as <animate>
cost four to seven CPU cores while the README was open and a pulse stepped eight times per
cycle two; the rotation alone costs nothing between turns and one short repaint per turn. Keep
every <animate> here on the rotation's time scale. Run from anywhere (rows.mjs first when the
builder's output changed; it rewrites terminal-rows.json from hooks/builder.ts):

    node design/readme/rows.mjs
    python design/readme/make.py
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent

THEMES = {
    'dark': dict(bg='#0D1117', panel='#161B22', text='#E6EDF3', dim='#8B949E', track='#21262D',
                 ramp=['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F', '#FF073A'],
                 parts=['#1E90FF', '#FF5F1F', '#00D45A', '#FFF01F', '#39FF14', '#6E7681']),
    'light': dict(bg='#FFFFFF', panel='#F6F8FA', text='#1F2328', dim='#656D76', track='#EBEDF0',
                  ramp=['#1874D2', '#32A800', '#139A43', '#A89200', '#E84A00', '#E8001F'],
                  parts=['#1874D2', '#E84A00', '#139A43', '#A89200', '#32A800', '#8C959F']),
}
# The context the graphics show, 930k of a 1M window, by category as the default context bar splits it
# (Messages, System tools, MCP tools, Skills, Other), and the autocompact buffer kept free after it.
PARTS = [700000, 40000, 120000, 10000, 60000]
BUFFER = 33000
WINDOW = 1000000
BOUNDS = [50, 60, 70, 80, 90]
RANGES = ['0 to 49', '50 to 59', '60 to 69', '70 to 79', '80 to 89', '90 and up']
NAMES = ['dodgerblue', 'lime green', 'darker green', 'yellow', 'orangered', 'red']
FONT = "font-family=\"'Segoe UI', system-ui, -apple-system, Roboto, sans-serif\""
def range_of(pct):
    i = 0
    for n, b in enumerate(BOUNDS):
        if pct >= b:
            i = n + 1
    return i


def defs():
    """The halo filter: the band's blur at the middle of its breath."""
    return ('<defs>'
            '<filter id="g" x="-100%" y="-200%" width="300%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>'
            '</defs>')


def halo(inner):
    """`inner` (one element, or a group) as a blurred halo under itself."""
    return f'<g filter="url(#g)" opacity="0.7">{inner}</g>'


_clip_n = 0


def pill_bar(x, y, w, pct, T, thickness=10.5, live=True, level=False):
    """A smooth bar: the ramp slices (or, under level coloring, one slice in the percent's color) clipped to a pill, on their halo."""
    rx = thickness / 2
    filled = max(thickness, w * pct / 100)
    global _clip_n
    _clip_n += 1
    cid = f'c{_clip_n}'
    slices = ''
    top = range_of(pct)
    parts = 1 if level else top + 1
    for i in range(parts):
        at = pct * i / parts
        hi = pct * (i + 1) / parts
        color = T['ramp'][top if level else i]
        slices += f'<rect x="{x + w * at / 100:.2f}" y="{y}" width="{w * (hi - at) / 100 + 0.5:.2f}" height="{thickness}" fill="{color}"/>'
    tip = T['ramp'][range_of(pct)]
    body = (f'<g clip-path="url(#{cid})"><rect x="{x}" y="{y}" width="{filled:.2f}" height="{thickness}" fill="{tip}"/>{slices}</g>')
    return (f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{filled:.2f}" height="{thickness}" rx="{rx}"/></clipPath>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{thickness}" rx="{rx}" fill="{T["track"]}"/>'
            f'{halo(body)}{body}')


def dot_bar(x, y, w, pct, T, live=True, level=True):
    """A row of dots: under level coloring (the default) every filled dot in the percent's color, under ramp coloring
    the filled dots running through the ranges up to the percent's."""
    n = int(w // 15)
    f = max(1, round(pct / 100 * n)) if pct > 0 else 0
    out = ''
    bounds = [0] + BOUNDS
    for k in range(n):
        cx = x + k * 15 + 7.5
        if k < f:
            top = range_of(pct)
            i = top if level or k >= f - 1 else min(top, int(k / f * (top + 1)))
            color = T['ramp'][i]
            out += halo(f'<circle cx="{cx}" cy="{y}" r="6" fill="{color}"/>')
            out += f'<circle cx="{cx}" cy="{y}" r="4.8" fill="{color}"/>'
        else:
            out += f'<circle cx="{cx}" cy="{y}" r="4.8" fill="{T["track"]}"/>'
    return out


def part_cells(n, pct):
    """The context bar's n cells by category, as the builder splits them: the percent's cells shared among the used
    categories by their tokens (largest remainder), then the buffer's cells. Returns (category index, glows) pairs."""
    f = max(1, round(pct / 100 * n)) if pct > 0 else 0
    used = sum(PARTS)
    quotas = [f * t / used for t in PARTS]
    counts = [int(q) for q in quotas]
    left = f - sum(counts)
    for i in sorted(range(len(PARTS)), key=lambda i: (-(quotas[i] - int(quotas[i])), i))[:left]:
        counts[i] += 1
    cells = [(i, True) for i, c in enumerate(counts) for _ in range(c)]
    buffer = min(n - len(cells), round(BUFFER / WINDOW * n))
    return cells + [(5, False)] * buffer


def parts_bar(x, y, w, pct, T, thickness=10.5):
    """The context bar split by category: the used categories in their colors up to the percent, then the
    autocompact buffer in grey without a halo, clipped to one pill, as the desktop draws it."""
    rx = thickness / 2
    used = sum(PARTS)
    buffer = min(100 - pct, BUFFER / WINDOW * 100)
    filled = max(thickness, w * (pct + buffer) / 100)
    global _clip_n
    _clip_n += 1
    cid = f'c{_clip_n}'
    at = 0
    glow = ''
    for i, t in enumerate(PARTS):
        span = pct * t / used
        glow += f'<rect x="{x + w * at / 100:.2f}" y="{y}" width="{w * span / 100 + 0.5:.2f}" height="{thickness}" fill="{T["parts"][i]}"/>'
        at += span
    body = glow + f'<rect x="{x + w * at / 100:.2f}" y="{y}" width="{w * buffer / 100:.2f}" height="{thickness}" fill="{T["parts"][5]}"/>'
    clipped = f'<g clip-path="url(#{cid})">'
    return (f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{filled:.2f}" height="{thickness}" rx="{rx}"/></clipPath>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{thickness}" rx="{rx}" fill="{T["track"]}"/>'
            + halo(clipped + glow + '</g>') + clipped + body + '</g>')


def parts_dots(x, y, w, pct, T):
    """The context's dots by category, then the buffer's in grey without a halo, then the track."""
    n = int(w // 15)
    cells = part_cells(n, pct)
    out = ''
    for k in range(n):
        cx = x + k * 15 + 7.5
        if k < len(cells):
            i, glows = cells[k]
            color = T['parts'][i]
            if glows:
                out += halo(f'<circle cx="{cx}" cy="{y}" r="6" fill="{color}"/>')
            out += f'<circle cx="{cx}" cy="{y}" r="4.8" fill="{color}"/>'
        else:
            out += f'<circle cx="{cx}" cy="{y}" r="4.8" fill="{T["track"]}"/>'
    return out


RING_R = 6.2
RING_W = 1.6
RING_ROOM = 30


def ring(cx, cy, pct, T, level=True):
    """The compact button: a ring of the track's color with the context percent drawn over it clockwise from the
    top, in its range color (or every range up to it under ramp coloring), on its halo."""
    import math
    length = 2 * math.pi * RING_R
    top = range_of(pct)
    parts = 1 if level else top + 1
    arcs = ''
    for i in range(parts):
        at = pct * i / parts
        span = pct / parts
        color = T['ramp'][top if level else i]
        arcs += (f'<circle cx="{cx}" cy="{cy}" r="{RING_R}" fill="none" stroke="{color}" stroke-width="{RING_W}" '
                 f'stroke-dasharray="{length * span / 100:.2f} {length:.2f}" stroke-dashoffset="{-length * at / 100:.2f}" '
                 f'transform="rotate(-90 {cx} {cy})"/>')
    return (f'<circle cx="{cx}" cy="{cy}" r="{RING_R}" fill="none" stroke="{T["track"]}" stroke-width="{RING_W}"/>'
            + halo(arcs) + arcs)


def glow_text(x, y, text, color, size=19.5, live=True, anchor='start'):
    attrs = f'x="{x}" y="{y}" {FONT} font-size="{size}" font-weight="700" fill="{color}" text-anchor="{anchor}"'
    return halo(f'<text {attrs}>{text}</text>') + f'<text {attrs}>{text}</text>'


def plain(x, y, text, color, size=19.5, weight=400, anchor='start', italic=False):
    st = ' font-style="italic"' if italic else ''
    return f'<text x="{x}" y="{y}" {FONT} font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{st}>{text}</text>'


ROTATE_S = 5
FABLE = (69, 'in 3d4h')


def turn(out, which, count=2):
    """Shows `out` on turn `which` of a rotation of `count` turns, 5 s each: the Weekly segment's two (the all-models
    week, then the Fable limit), or the single layout's one per segment. A discrete opacity step, nothing in between."""
    if count == 2:
        values, times = ('1;0' if which == 0 else '0;1'), '0;0.5'
    else:
        start, end = which / count, (which + 1) / count
        if which == 0:
            values, times = '1;0', f'0;{end:g}'
        elif which == count - 1:
            values, times = '0;1', f'0;{start:g}'
        else:
            values, times = '0;1;0', f'0;{start:g};{end:g}'
    return (f'<g opacity="{1 if which == 0 else 0}"><animate attributeName="opacity" values="{values}" keyTimes="{times}" '
            f'dur="{count * ROTATE_S}s" calcMode="discrete" repeatCount="indefinite"/>{out}</g>')


def segment(x, y, label, pct, extra, T, mode, seg_w, live):
    """One segment: label, bar, glowing percent and the reset or token field."""
    out = plain(x, y + 7, label, T['text'])
    lab_w = 72 if label not in ('Context',) else 80
    bar_x = x + lab_w
    bar_w = seg_w - lab_w - 150
    if label == 'Context':
        # The context bar splits by category whatever the coloring (contextBar: breakdown, the default).
        out += parts_bar(bar_x, y - 5.25, bar_w, pct, T) if mode in ('bars', 'level') else parts_dots(bar_x, y, bar_w, pct, T)
    elif mode == 'bars':
        out += pill_bar(bar_x, y - 5.25, bar_w, pct, T, live=live)
    elif mode == 'level':
        out += pill_bar(bar_x, y - 5.25, bar_w, pct, T, live=live, level=True)
    else:
        # `dots` in the default level coloring, `dots-ramp` with ramp coloring.
        out += dot_bar(bar_x, y, bar_w, pct, T, live=live, level=mode != 'dots-ramp')
    color = T['ramp'][range_of(pct)]
    if not live:
        color = mix_toward(color, T['bg'], 0.45)
    out += glow_text(bar_x + bar_w + 14, y + 7, f'{round(pct)}%', color, live=live)
    out += plain(bar_x + bar_w + 64, y + 7, extra, T['text'])
    return out


def compact_button(x, y, width, T, mode, pct):
    """The compact button beside the row on the right (it shows from 75% of the context, so at 93% it does),
    its ring colored as the row's bars are."""
    return ring(x + width - RING_ROOM / 2 + 4, y, pct, T, level=mode in ('level', 'dots'))


def band_row(x, y, width, T, mode, windows, stale=False):
    """One band row: 5-hour, Weekly and Context segments laid out across `width`, the compact button beside them.
    The Weekly segment takes turns with the account's Fable limit, as the band does."""
    out = compact_button(x, y, width, T, mode, windows[2])
    width -= RING_ROOM
    labels = ['5-hour', 'Weekly', 'Context']
    extras = ['in 3h13m', 'in 3d4h', '930k/1M']
    seg_w = (width - 2 * 30) / 3
    cx = x
    for n, (label, pct, extra) in enumerate(zip(labels, windows, extras)):
        if n > 0:
            out += plain(cx - 15, y + 7, '│', T['dim'], anchor='middle')
        live = not stale or n == 2
        if n == 1:
            out += turn(segment(cx, y, label, pct, extra, T, mode, seg_w, live), 0)
            out += turn(segment(cx, y, 'Fable', FABLE[0], FABLE[1], T, mode, seg_w, live), 1)
        else:
            out += segment(cx, y, label, pct, extra, T, mode, seg_w, live)
        cx += seg_w + 30
    return out


SINGLE_TURNS = [('5-hour', 82, 'in 3h13m'), ('Weekly', 18.2, 'in 3d4h'), ('Fable', FABLE[0], FABLE[1]), ('Context', 93, '930k/1M')]


def single_row(x, y, width, T, mode):
    """The single layout's row: one segment across the whole width, taking turns through 5-hour, Weekly, Fable
    and Context, 5 s each, as the band does with `layout` set to `single`; the compact button stays beside it."""
    return compact_button(x, y, width, T, mode, 93) + ''.join(
        turn(segment(x, y, label, pct, extra, T, mode, width - RING_ROOM, True), n, len(SINGLE_TURNS))
        for n, (label, pct, extra) in enumerate(SINGLE_TURNS))


def mix_toward(color, ground, strength):
    c = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    g = [int(ground[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02X%02X%02X' % tuple(round(gi + (ci - gi) * strength) for ci, gi in zip(c, g))


# The page around the panels: white with black text, or GitHub's dark canvas with white text when the reader's
# system is dark. An SVG shown through <img> sees the browser's prefers-color-scheme, so the drawing blends into
# the README on either theme; only the panels keep the theme they show.
PAGE = {'light': ('#FFFFFF', '#000000'), 'dark': ('#0D1117', '#FFFFFF')}


def page_style():
    light, dark = PAGE['light'], PAGE['dark']
    return (f'<style>.page{{fill:{light[0]}}}.ink{{fill:{light[1]}}}'
            f'@media (prefers-color-scheme: dark){{.page{{fill:{dark[0]}}}.ink{{fill:{dark[1]}}}}}</style>')


def page(W, H):
    """The page under everything, in the reader's theme."""
    return f'<rect class="page" width="{W}" height="{H}"/>'


def ink(x, y, text, size=15, weight=400, anchor='start'):
    """Text on the page, outside every panel: black on white or white on black, never grey."""
    return f'<text class="ink" x="{x}" y="{y}" {FONT} font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{text}</text>'


def panel(x, y, w, h, T, title):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{T["panel"]}" stroke="{T["track"]}"/>'
            + plain(x + w / 2, y + 32, title, T['text'], size=15, weight=600, anchor='middle'))


# The `layout` option's two values, as the graphics title their groups.
LAYOUT_ALL = 'Layout: All (Default)'
LAYOUT_SINGLE = 'Layout: Single (One Segment at a Time)'


def hero():
    W, H = 1200, 1440
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', page_style(), defs(), page(W, H)]
    # stacked: the dark panel on top, the light one below, on the reader's page
    for n, (name, T) in enumerate(THEMES.items()):
        top = n * H / 2
        out.append(panel(20, top + 20, W - 40, H / 2 - 40, T, f'{name.title()} Theme'))
        # One group per layout, titled under the theme; in each, one row per look, titled above it, the default first.
        rows = [('level', 'Level Bars (Default)'), ('bars', 'Ramp Bars'), ('dots', 'Level Dots'), ('dots-ramp', 'Ramp Dots')]
        y = top + 80
        for subtitle, draw in ((LAYOUT_ALL, lambda ry, mode: band_row(44, ry, W - 88, T, mode, [82, 18.2, 93])),
                               (LAYOUT_SINGLE, lambda ry, mode: single_row(44, ry, W - 88, T, mode))):
            out.append(plain(44, y, subtitle, T['text'], size=14, weight=600))
            for k, (mode, title) in enumerate(rows):
                title_y = y + 28 + k * 70
                out.append(plain(44, title_y, title, T['dim'], size=13, weight=600))
                out.append(draw(title_y + 26, mode))
            y += 28 + len(rows) * 70 + 14
    out.append('</svg>')
    return '\n'.join(out)


def palette():
    W, H = 1200, 300
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', page_style(), defs(), page(W, H)]
    for n, (name, T) in enumerate(THEMES.items()):
        left = n * W / 2
        # Each theme in a panel of its own, side by side on the reader's page.
        out.append(f'<rect x="{left + 10}" y="10" width="{W / 2 - 20}" height="{H - 20}" rx="14" fill="{T["panel"]}" stroke="{T["track"]}"/>')
        out.append(plain(left + W / 4, 38, f'{name.title()} Theme', T['text'], size=15, weight=600, anchor='middle'))
        for i, color in enumerate(T['ramp']):
            y = 70 + i * 36
            out.append(halo(f'<rect x="{left + 28}" y="{y - 11}" width="120" height="10.5" rx="5.25" fill="{color}"/>'))
            out.append(f'<rect x="{left + 28}" y="{y - 11}" width="120" height="10.5" rx="5.25" fill="{color}"/>')
            out.append(glow_text(left + 170, y + 1, f'{[0, 50, 60, 70, 80, 90][i]}%', color, size=17))
            out.append(plain(left + W / 4, y + 1, f'{RANGES[i]} used', T['text'], size=15, anchor='middle'))
            out.append(plain(left + 412, y + 1, NAMES[i], T['dim'], size=15))
            out.append(plain(left + 524, y + 1, color, T['dim'], size=13))
    out.append('</svg>')
    return '\n'.join(out)


TAGLINE = "Your Claude Code rate limits and context as one glowing neon row above the prompt!"


def title(theme):
    """The README's title for one theme: NeonMeter in dodgerblue on its halo, like a live percent, and the tagline
    beneath it with every word in the next range color. Transparent, for GitHub's matching color scheme."""
    T = THEMES[theme]
    W, H = 1000, 150
    color = T['ramp'][0]
    attrs = f'x="{W / 2}" y="66" {FONT} font-size="56" font-weight="700" fill="{color}" text-anchor="middle" letter-spacing="1"'
    words = TAGLINE.split(' ')
    # Each word takes the next range color; the run is centered by SVG itself (one text, several spans).
    spans = ''.join(f'<tspan fill="{T["ramp"][i % 6]}">{w}</tspan>' + (' ' if i < len(words) - 1 else '') for i, w in enumerate(words))
    tag_attrs = f'x="{W / 2}" y="122" {FONT} font-size="21" font-weight="600" text-anchor="middle"'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + defs()
            + halo(f'<text {attrs}>NeonMeter</text>')
            + f'<text {attrs}>NeonMeter</text>'
            + halo(f'<text {tag_attrs}>{spans}</text>')
            + f'<text {tag_attrs}>{spans}</text>'
            + '</svg>')


MONO = "font-family=\"'Cascadia Mono', 'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace\""
CELL_W = 8.4
CELL_H = 22
PROMPT_CELLS = len('❯ Try "how does <filepath> work?"')


def cells(n):
    """Pins a monospace text to n cells: a viewer whose fallback font runs wider or narrower than CELL_W (Android's
    monospace, a box-drawing glyph from another font) gets it stretched or squeezed to fit instead of overflowing."""
    return f'textLength="{n * CELL_W:g}" lengthAdjust="spacingAndGlyphs"'


def terminal_row(x, y, spans):
    """One terminal row: the builder's spans as tspans in one monospace text, so the columns line up whatever font
    the viewer has. The builder marks live spans, but the drawing holds still (see the module docstring)."""
    out = f'<text x="{x}" y="{y}" {MONO} font-size="14" {cells(sum(len(sp["text"]) for sp in spans))} xml:space="preserve">'
    for sp in spans:
        text = sp['text'].replace('&', '&amp;').replace('<', '&lt;')
        weight = ' font-weight="700"' if sp.get('bold') else ''
        style = ' font-style="italic"' if sp.get('italic') else ''
        out += f'<tspan fill="{sp["color"]}"{weight}{style}>{text}</tspan>'
    out += '</text>'
    return out


def terminal_theme(theme, top, W):
    """The terminal band on one theme, from the builder's own rows (terminal-rows.json, one row per turn): level,
    ramp and dotted cells at 120 columns, the compact and narrow layouts at 72 and 40, and the single layout in the
    three looks. Each panel is the rule in the prompt border's color with Claude Code's [-] at its end, the cell row
    taking its turns (Weekly and Fable, or every segment in the single layout), the input box's rule and the prompt.
    Returns the markup and the height it took."""
    import json
    rows = json.loads((HERE / 'terminal-rows.json').read_text(encoding='utf-8'))
    T = THEMES[theme]
    border = '#30363D' if theme == 'dark' else '#D0D7DE'
    panel_h = 4 * CELL_H + 24
    gap = 46
    # The same looks as the hero, grouped by the `layout` option: level coloring (the default), ramp coloring, and dots
    # (the `glyph` option set to `●`) in either coloring, plus, in the default layout, the narrower tiers the terminal
    # picks by width.
    groups = ((LAYOUT_ALL, ((120, 'level coloring (default)', f'{theme}-120'),
                            (120, 'ramp coloring', f'{theme}-120-ramp'),
                            (120, 'dots (glyph ●), level coloring', f'{theme}-120-dots'),
                            (120, 'dots (glyph ●), ramp coloring', f'{theme}-120-dots-ramp'),
                            (72, 'level coloring, compact', f'{theme}-72'),
                            (40, 'narrow, no bars', f'{theme}-40'))),
              (LAYOUT_SINGLE, ((120, 'level coloring (default)', f'{theme}-120-single'),
                               (120, 'ramp coloring', f'{theme}-120-single-ramp'),
                               (120, 'dots (glyph ●), level coloring', f'{theme}-120-single-dots'),
                               (120, 'dots (glyph ●), ramp coloring', f'{theme}-120-single-dots-ramp'))))
    subtitle_h = 34
    count = sum(len(panels) for _, panels in groups)
    height = 56 + len(groups) * subtitle_h + count * (panel_h + gap + 24) - gap + 20
    # The titles sit on the reader's page; only the terminal panels below them take the theme.
    out = [ink(W / 2, top + 36, f'{theme.title()} Theme', size=15, weight=600, anchor='middle')]
    y = top + 56
    for subtitle, panels in groups:
        out.append(ink(20, y + 20, subtitle, size=14, weight=600))
        y += subtitle_h
        for cols, what, key in panels:
            out.extend(terminal_panel(rows[key], cols, what, y, T, border, panel_h))
            y += panel_h + gap + 24
    return "\n".join(out), height


def terminal_panel(row, cols, what, y, T, border, panel_h):
    """One terminal panel at `y`: its label, the rule with [-], the cell row taking its turns, the input box's rule and
    the prompt."""
    out = [ink(20, y + 14, f'{cols} columns · {what}', size=13, weight=600)]
    px = 20
    py = y + 24
    pw = cols * CELL_W + 16
    out.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{panel_h}" rx="6" fill="{T["panel"]}" stroke="{border}"/>')
    tx = px + 8
    rule_y = py + CELL_H - 6
    out.append(f'<text x="{tx}" y="{rule_y}" {MONO} font-size="14" {cells(cols)} xml:space="preserve"><tspan fill="{border}">{"─" * (cols - 3)}</tspan><tspan fill="{T["dim"]}">[-]</tspan></text>')
    row_y = py + 2 * CELL_H - 6
    # One row per turn, shown 5 s each: Weekly and Fable in the default layout, every segment in the single one.
    for which, spans in enumerate(row['turns']):
        out.append(turn(terminal_row(tx, row_y, spans), which, len(row['turns'])))
    out.append(f'<text x="{tx}" y="{py + 3 * CELL_H - 6}" {MONO} font-size="14" {cells(cols)} fill="{border}" xml:space="preserve">{"─" * cols}</text>')
    out.append(f'<text x="{tx}" y="{py + 4 * CELL_H - 6}" {MONO} font-size="14" {cells(PROMPT_CELLS)} xml:space="preserve"><tspan fill="{T["text"]}">❯ </tspan><tspan fill="{T["dim"]}">Try "how does &lt;filepath&gt; work?"</tspan></text>')
    return out


def terminal():
    """Both themes stacked, the dark one on top, as the hero does."""
    W = 1100
    dark, h1 = terminal_theme('dark', 0, W)
    light, h2 = terminal_theme('light', h1, W)
    H = h1 + h2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + page_style() + defs() + page(W, H)
            + dark + light + '</svg>')


if __name__ == '__main__':
    # LF on every platform, as .gitattributes keeps *.svg (text mode on Windows would write CRLF).
    (HERE / 'hero.svg').write_text(hero(), encoding='utf-8', newline='\n')
    (HERE / 'palette.svg').write_text(palette(), encoding='utf-8', newline='\n')
    (HERE / 'title-dark.svg').write_text(title('dark'), encoding='utf-8', newline='\n')
    (HERE / 'title-light.svg').write_text(title('light'), encoding='utf-8', newline='\n')
    (HERE / 'terminal.svg').write_text(terminal(), encoding='utf-8', newline='\n')
    print('wrote', HERE / 'hero.svg', HERE / 'palette.svg', HERE / 'title-dark.svg', HERE / 'title-light.svg', HERE / 'terminal.svg')
