"""Draws the README graphics: hero.svg (the band on both themes), palette.svg
(the six ranges) title-dark.svg / title-light.svg (the glowing name and tagline) and
terminal.svg (the terminal band at three widths on both themes, from the builder's own
rows in terminal-rows.json). Pure SVG with the same glow the desktop band draws: a blurred
halo of each color under it, pulsing on an 800 ms cycle. Run from anywhere:

    python design/readme/make.py
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent

THEMES = {
    'dark': dict(bg='#0D1117', panel='#161B22', text='#E6EDF3', dim='#8B949E', track='#21262D',
                 ramp=['#1E90FF', '#39FF14', '#00D45A', '#FFF01F', '#FF5F1F', '#FF073A']),
    'light': dict(bg='#FFFFFF', panel='#F6F8FA', text='#1F2328', dim='#656D76', track='#EBEDF0',
                  ramp=['#1874D2', '#32A800', '#139A43', '#A89200', '#E84A00', '#E8001F']),
}
BOUNDS = [50, 60, 70, 80, 90]
RANGES = ['0 to 49', '50 to 59', '60 to 69', '70 to 79', '80 to 89', '90 and up']
NAMES = ['dodgerblue', 'lime green', 'darker green', 'yellow', 'orangered', 'red']
FONT = "font-family=\"'Segoe UI', system-ui, -apple-system, Roboto, sans-serif\""
MS = 800


def mix_white(hex_color, strength):
    r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
    f = lambda c: round(255 + (c - 255) * strength)
    return '#%02X%02X%02X' % (f(r), f(g), f(b))


def peak(color):
    return mix_white(color, 1 - 0.45)


def range_of(pct):
    i = 0
    for n, b in enumerate(BOUNDS):
        if pct >= b:
            i = n + 1
    return i


def anim(attr, values, delay=0):
    return (f'<animate attributeName="{attr}" values="{values}" dur="{MS}ms" begin="{delay}ms" repeatCount="indefinite" '
            f'calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>')


def defs():
    return ('<defs>'
            '<filter id="g" x="-100%" y="-200%" width="300%" height="500%"><feGaussianBlur stdDeviation="3">'
            + anim('stdDeviation', '3;6;3') + '</feGaussianBlur></filter>'
            '<filter id="r" x="-100%" y="-200%" width="300%" height="500%"><feGaussianBlur stdDeviation="3"/></filter>'
            '</defs>')


def glow_attrs(live=True):
    if live:
        return 'filter="url(#g)" opacity="0.7">' + anim('opacity', '0.7;0.95;0.7')
    return 'filter="url(#r)" opacity="0.7">'


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
        slices += (f'<rect x="{x + w * at / 100:.2f}" y="{y}" width="{w * (hi - at) / 100 + 0.5:.2f}" height="{thickness}" fill="{color}">'
                   + (anim('fill', f'{color};{peak(color)};{color}') if live else '') + '</rect>')
    tip = T['ramp'][range_of(pct)]
    body = (f'<g clip-path="url(#{cid})"><rect x="{x}" y="{y}" width="{filled:.2f}" height="{thickness}" fill="{tip}"/>{slices}</g>')
    return (f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{filled:.2f}" height="{thickness}" rx="{rx}"/></clipPath>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{thickness}" rx="{rx}" fill="{T["track"]}"/>'
            f'<g {glow_attrs(live)}{body}</g>{body}')


def dot_bar(x, y, w, pct, T, live=True):
    n = int(w // 15)
    f = max(1, round(pct / 100 * n)) if pct > 0 else 0
    out = ''
    bounds = [0] + BOUNDS
    for k in range(n):
        cx = x + k * 15 + 7.5
        if k < f:
            top = range_of(pct)
            i = top if k >= f - 1 else min(top, int(k / f * (top + 1)))
            color = T['ramp'][i]
            out += f'<circle cx="{cx}" cy="{y}" r="6" fill="{color}" {glow_attrs(live)}</circle>'
            out += (f'<circle cx="{cx}" cy="{y}" r="4.8" fill="{color}">'
                    + (anim('fill', f'{color};{peak(color)};{color}') if live else '') + '</circle>')
        else:
            out += f'<circle cx="{cx}" cy="{y}" r="4.8" fill="{T["track"]}"/>'
    return out


def glow_text(x, y, text, color, size=19.5, live=True, anchor='start'):
    attrs = f'x="{x}" y="{y}" {FONT} font-size="{size}" font-weight="700" fill="{color}" text-anchor="{anchor}"'
    return (f'<text {attrs} {glow_attrs(live)}{text}</text>'
            f'<text {attrs}>{text}' + (anim('fill', f'{color};{peak(color)};{color}') if live else '') + '</text>')


def plain(x, y, text, color, size=19.5, weight=400, anchor='start', italic=False):
    st = ' font-style="italic"' if italic else ''
    return f'<text x="{x}" y="{y}" {FONT} font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{st}>{text}</text>'


ROTATE_S = 5
FABLE = (69, 'Thu 14:05')


def turn(out, which):
    """Shows `out` on one turn of the Weekly rotation: the all-models week (0) or the Fable limit (1), 5 s each."""
    values = '1;0' if which == 0 else '0;1'
    return (f'<g opacity="{1 if which == 0 else 0}"><animate attributeName="opacity" values="{values}" keyTimes="0;0.5" '
            f'dur="{2 * ROTATE_S}s" calcMode="discrete" repeatCount="indefinite"/>{out}</g>')


def segment(x, y, label, pct, extra, T, mode, seg_w, live):
    """One segment: label, bar, glowing percent and the reset or token field."""
    out = plain(x, y + 7, label, T['text'])
    lab_w = 72 if label not in ('Context',) else 80
    bar_x = x + lab_w
    bar_w = seg_w - lab_w - 150
    if mode == 'bars':
        out += pill_bar(bar_x, y - 5.25, bar_w, pct, T, live=live)
    elif mode == 'level':
        out += pill_bar(bar_x, y - 5.25, bar_w, pct, T, live=live, level=True)
    else:
        out += dot_bar(bar_x, y, bar_w, pct, T, live=live)
    color = T['ramp'][range_of(pct)]
    if not live:
        color = mix_toward(color, T['bg'], 0.45)
    out += glow_text(bar_x + bar_w + 14, y + 7, f'{round(pct)}%', color, live=live)
    out += plain(bar_x + bar_w + 64, y + 7, extra, T['text'])
    return out


def band_row(x, y, width, T, mode, windows, stale=False):
    """One band row: 5-hour, Weekly and Context segments laid out across `width`.
    The Weekly segment takes turns with the account's Fable limit, as the band does."""
    out = ''
    labels = ['5-hour', 'Weekly', 'Context']
    extras = ['in 3h13m', 'Thu 14:05', '930k/1M']
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


def mix_toward(color, ground, strength):
    c = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    g = [int(ground[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02X%02X%02X' % tuple(round(gi + (ci - gi) * strength) for ci, gi in zip(c, g))


def canvas_open(W, H):
    """Clips everything that follows to the frame's rounded shape, so the backgrounds have round corners too."""
    return f'<clipPath id="canvas"><rect width="{W}" height="{H}" rx="14"/></clipPath><g clip-path="url(#canvas)">'


def frame(W, H):
    """A thin rounded border around a whole drawing, neutral enough for either half of a two-theme canvas."""
    return f'<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="14" fill="none" stroke="#6E7681" stroke-opacity="0.6"/>'


def panel(x, y, w, h, T, title):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{T["panel"]}" stroke="{T["track"]}"/>'
            + plain(x + w / 2, y + 32, title, T['text'], size=15, weight=600, anchor='middle'))


def hero():
    W, H = 1200, 600
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', defs(), canvas_open(W, H)]
    # stacked: the dark panel on top, the light one below
    out.append(f'<rect width="{W}" height="{H / 2}" fill="{THEMES["dark"]["bg"]}"/>')
    out.append(f'<rect y="{H / 2}" width="{W}" height="{H / 2}" fill="{THEMES["light"]["bg"]}"/>')
    for n, (name, T) in enumerate(THEMES.items()):
        top = n * H / 2
        out.append(panel(20, top + 20, W - 40, H / 2 - 40, T, f'{name.title()} Theme'))
        # One row per look, each titled above it at the left, the default first.
        rows = [('bars', 'Ramp Bars (Default)'), ('level', 'Level Bars'), ('dots', 'Dots')]
        for k, (mode, title) in enumerate(rows):
            title_y = top + 72 + k * 70
            out.append(plain(44, title_y, title, T['dim'], size=13, weight=600))
            out.append(band_row(44, title_y + 26, W - 88, T, mode, [82, 18.2, 93]))
    out.append('</g>')
    out.append(frame(W, H))
    out.append('</svg>')
    return '\n'.join(out)


def palette():
    W, H = 1200, 300
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', defs(), canvas_open(W, H)]
    out.append(f'<rect width="{W / 2}" height="{H}" fill="{THEMES["dark"]["bg"]}"/>')
    out.append(f'<rect x="{W / 2}" width="{W / 2}" height="{H}" fill="{THEMES["light"]["bg"]}"/>')
    for n, (name, T) in enumerate(THEMES.items()):
        left = n * W / 2
        out.append(plain(left + W / 4, 38, f'{name.title()} Theme', T['text'], size=15, weight=600, anchor='middle'))
        for i, color in enumerate(T['ramp']):
            y = 70 + i * 36
            out.append(f'<rect x="{left + 28}" y="{y - 11}" width="120" height="10.5" rx="5.25" fill="{color}" {glow_attrs()}</rect>')
            out.append(f'<rect x="{left + 28}" y="{y - 11}" width="120" height="10.5" rx="5.25" fill="{color}">'
                       + anim('fill', f'{color};{peak(color)};{color}') + '</rect>')
            out.append(glow_text(left + 170, y + 1, f'{[0, 50, 60, 70, 80, 90][i]}%', color, size=17))
            out.append(plain(left + W / 4, y + 1, f'{RANGES[i]} used', T['text'], size=15, anchor='middle'))
            out.append(plain(left + 412, y + 1, NAMES[i], T['dim'], size=15))
            out.append(plain(left + 524, y + 1, color, T['dim'], size=13))
    out.append('</g>')
    out.append(frame(W, H))
    out.append('</svg>')
    return '\n'.join(out)


TAGLINE = "Your Claude Code rate limits and context as one glowing neon row above the prompt!"


def title(theme):
    """The README's title for one theme: NeonMeter in dodgerblue on its halo, pulsing like a live percent, and the
    tagline beneath it with every word in the next range color. Transparent, for GitHub's matching color scheme."""
    T = THEMES[theme]
    W, H = 1000, 150
    color = T['ramp'][0]
    attrs = f'x="{W / 2}" y="66" {FONT} font-size="56" font-weight="700" fill="{color}" text-anchor="middle" letter-spacing="1"'
    words = TAGLINE.split(' ')
    # Each word takes the next range color; the run is centered by SVG itself (one text, several spans).
    # Every word in the next range color, pulsing toward white like a live percent.
    spans = ''.join(f'<tspan fill="{T["ramp"][i % 6]}">{w}' + anim('fill', f'{T["ramp"][i % 6]};{peak(T["ramp"][i % 6])};{T["ramp"][i % 6]}') + '</tspan>' + (' ' if i < len(words) - 1 else '') for i, w in enumerate(words))
    tag_attrs = f'x="{W / 2}" y="122" {FONT} font-size="21" font-weight="600" text-anchor="middle"'
    tagline_glow = ''.join(f'<tspan fill="{T["ramp"][i % 6]}">{w}</tspan>' + (' ' if i < len(words) - 1 else '') for i, w in enumerate(words))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + defs()
            + f'<text {attrs} {glow_attrs()}NeonMeter</text>'
            + f'<text {attrs}>NeonMeter' + anim('fill', f'{color};{peak(color)};{color}') + '</text>'
            + f'<text {tag_attrs} {glow_attrs()}{tagline_glow}</text>'
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
    the viewer has; a live span carries its own pulse, the color toward white and back, as the terminal draws it."""
    out = f'<text x="{x}" y="{y}" {MONO} font-size="14" {cells(sum(len(sp["text"]) for sp in spans))} xml:space="preserve">'
    for sp in spans:
        text = sp['text'].replace('&', '&amp;').replace('<', '&lt;')
        weight = ' font-weight="700"' if sp.get('bold') else ''
        style = ' font-style="italic"' if sp.get('italic') else ''
        pulse = anim('fill', f'{sp["color"]};{peak(sp["color"])};{sp["color"]}') if sp.get('live') else ''
        out += f'<tspan fill="{sp["color"]}"{weight}{style}>{text}{pulse}</tspan>'
    out += '</text>'
    return out


def terminal_theme(theme, top, W):
    """The terminal band at 120, 72 and 40 columns on one theme, from the builder's own rows (terminal-rows.json,
    one row per Weekly turn): the rule in the prompt border's color with Claude Code's [-] at its end, the cell row
    rotating between Weekly and Fable, the input box's rule and the prompt, live cells pulsing like the terminal does.
    Returns the markup and the height it took."""
    import json
    rows = json.loads((HERE / 'terminal-rows.json').read_text(encoding='utf-8'))
    T = THEMES[theme]
    border = '#30363D' if theme == 'dark' else '#D0D7DE'
    panel_h = 4 * CELL_H + 24
    gap = 46
    height = 56 + 3 * (panel_h + gap + 24) - gap + 20
    out = [f'<rect y="{top}" width="{W}" height="{height}" fill="{T["bg"]}"/>']
    out.append(plain(W / 2, top + 36, f'{theme.title()} Theme', T['text'], size=15, weight=600, anchor='middle'))
    y = top + 56
    for cols, tier in ((120, 'full'), (72, 'compact'), (40, 'narrow')):
        row = rows[f'{theme}-{cols}']
        out.append(plain(20, y + 14, f'{cols} columns · {tier} layout', T['dim'], size=13, weight=600))
        px = 20
        py = y + 24
        pw = cols * CELL_W + 16
        out.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{panel_h}" rx="6" fill="{T["panel"]}" stroke="{border}"/>')
        tx = px + 8
        rule_y = py + CELL_H - 6
        out.append(f'<text x="{tx}" y="{rule_y}" {MONO} font-size="14" {cells(cols)} xml:space="preserve"><tspan fill="{border}">{"─" * (cols - 3)}</tspan><tspan fill="{T["dim"]}">[-]</tspan></text>')
        row_y = py + 2 * CELL_H - 6
        # The Weekly segment takes turns with the Fable limit, as the band does: one row per turn, shown 5 s each.
        for which, spans in enumerate(row['turns']):
            out.append(turn(terminal_row(tx, row_y, spans), which))
        out.append(f'<text x="{tx}" y="{py + 3 * CELL_H - 6}" {MONO} font-size="14" {cells(cols)} fill="{border}" xml:space="preserve">{"─" * cols}</text>')
        out.append(f'<text x="{tx}" y="{py + 4 * CELL_H - 6}" {MONO} font-size="14" {cells(PROMPT_CELLS)} xml:space="preserve"><tspan fill="{T["text"]}">❯ </tspan><tspan fill="{T["dim"]}">Try "how does &lt;filepath&gt; work?"</tspan></text>')
        y += panel_h + gap + 24
    return "\n".join(out), height


def terminal():
    """Both themes stacked, the dark one on top, as the hero does."""
    W = 1100
    dark, h1 = terminal_theme('dark', 0, W)
    light, h2 = terminal_theme('light', h1, W)
    H = h1 + h2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + defs() + canvas_open(W, H)
            + dark + light + '</g>' + frame(W, H) + '</svg>')


if __name__ == '__main__':
    (HERE / 'hero.svg').write_text(hero(), encoding='utf-8')
    (HERE / 'palette.svg').write_text(palette(), encoding='utf-8')
    (HERE / 'title-dark.svg').write_text(title('dark'), encoding='utf-8')
    (HERE / 'title-light.svg').write_text(title('light'), encoding='utf-8')
    (HERE / 'terminal.svg').write_text(terminal(), encoding='utf-8')
    print('wrote', HERE / 'hero.svg', HERE / 'palette.svg', HERE / 'title-dark.svg', HERE / 'title-light.svg', HERE / 'terminal.svg')
