"""Hand-inked SVG UI frames (wobbly uneven-weight outline, paper grain, hatch, offset ink shadow) -> public/ui/frames/svg/*.svg
and src/ui-art.css (border-image sources + px slices). All shapes are procedurally drawn here (original art). Run: python tools/gen_frames_svg.py"""
import math, os, random
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "..", "public", "ui", "frames", "svg")
os.makedirs(OUT, exist_ok=True)
INK = "#2a1a10"


class Noise:
    def __init__(s, seed):
        r = random.Random(seed)
        s.p = [(r.uniform(.8, 2.6), r.uniform(0, 6.28), r.uniform(.4, 1)) for _ in range(4)]

    def __call__(s, t):
        return sum(a * math.sin(f * t + ph) for f, ph, a in s.p) / 2.4


def rr_points(x, y, w, h, r, seed, amp, step=5):
    """points around a wobbly rounded rect, clockwise."""
    n = Noise(seed)
    rj = random.Random(seed + 7)
    rs = [max(2, r * rj.uniform(.8, 1.2)) for _ in range(4)]
    pts = []
    cnt = [0]

    def add(px, py, nx, ny):
        d = amp * n(cnt[0] * .11)
        pts.append((px + nx * d, py + ny * d))
        cnt[0] += 1

    def edge(x0, y0, x1, y1, nx, ny):
        L = math.hypot(x1 - x0, y1 - y0)
        k = max(2, int(L / step))
        for j in range(k):
            t = j / k
            add(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, nx, ny)

    def arc(cx, cy, rad, a0, a1):
        k = 7
        for j in range(k):
            a = math.radians(a0 + (a1 - a0) * j / k)
            add(cx + rad * math.cos(a), cy + rad * math.sin(a), math.cos(a), math.sin(a))

    tl, tr, br, bl = rs
    edge(x + tl, y, x + w - tr, y, 0, -1)
    arc(x + w - tr, y + tr, tr, -90, 0)
    edge(x + w, y + tr, x + w, y + h - br, 1, 0)
    arc(x + w - br, y + h - br, br, 0, 90)
    edge(x + w - br, y + h, x + bl, y + h, 0, 1)
    arc(x + bl, y + h - bl, bl, 90, 180)
    edge(x, y + h - bl, x, y + tl, -1, 0)
    arc(x + tl, y + tl, tl, 180, 270)
    return pts


def path(pts, dx=0, dy=0):
    P = [(a + dx, b + dy) for a, b in pts]
    n = len(P)

    def mid(a, b):
        return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    m0 = mid(P[-1], P[0])
    d = f"M{m0[0]:.1f},{m0[1]:.1f}"
    for i in range(n):
        m = mid(P[i], P[(i + 1) % n])
        d += f"Q{P[i][0]:.1f},{P[i][1]:.1f} {m[0]:.1f},{m[1]:.1f}"
    return d + "Z"


def hatch(x, y, w, h, seed, n, op=.13, col="#7a5428"):
    r = random.Random(seed)
    s = ""
    for _ in range(n):
        px = r.uniform(x, x + w)
        py = r.uniform(y, y + h)
        L = r.uniform(6, 16)
        s += f'<path d="M{px:.1f},{py:.1f} l{L:.1f},{-L*.8:.1f}" stroke="{col}" stroke-width="{r.uniform(.8,1.6):.1f}" stroke-linecap="round" opacity="{op}" fill="none"/>'
    return s


GRAIN = ('<filter id="gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="4" result="n"/>'
         '<feColorMatrix in="n" values="0 0 0 0 .38  0 0 0 0 .24  0 0 0 0 .1  1.1 0 0 0 -.5"/></filter>')


def box(w, h, fill, r=26, t=9, sh=5, seed=1, band=None, inner=None, studs=False, grain=True, hat=14, hi=None, bandfrac=.2):
    """w,h = canvas. shape occupies (0,0)-(w-sh,h-sh); sh = offset ink shadow."""
    W, H = w - sh, h - sh
    outer = rr_points(1, 1, W - 2, H - 2, r, seed, t * .32)
    inn = rr_points(1 + t, 1 + t, W - 2 - 2 * t, H - 2 - 2 * t, max(4, r - t * .8), seed + 11, t * .3)
    s = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{GRAIN}<clipPath id="c"><path d="{path(inn)}"/></clipPath></defs>'
    s += f'<path d="{path(outer, sh, sh)}" fill="#000" opacity=".30"/>'
    s += f'<path d="{path(outer)}" fill="{INK}"/>'
    s += f'<path d="{path(inn)}" fill="{fill}"/><g clip-path="url(#c)">'
    if band:
        s += f'<rect x="0" y="{H - t - H * bandfrac:.1f}" width="{w}" height="{H}" fill="{band}"/>'
    if grain:
        s += f'<rect x="0" y="0" width="{w}" height="{h}" fill="#fff" filter="url(#gr)" opacity=".55"/>'
    if hat:
        s += hatch(t, t, W - 2 * t, H - 2 * t, seed, hat)
    if hi:
        s += f'<path d="M{t+r*.7:.0f},{t+5} L{W*.55:.0f},{t+5}" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>'
    s += '</g>'
    if inner:
        ip = rr_points(1 + t + 7, 1 + t + 7, W - 2 - 2 * t - 14, H - 2 - 2 * t - 14, max(3, r - t - 4), seed + 21, 1.2)
        s += f'<path d="{path(ip)}" fill="none" stroke="{inner}" stroke-width="2.4" opacity=".8" stroke-linecap="round"/>'
    if studs:
        for (cx, cy) in [(t + 3, t + 3), (W - t - 3, t + 3), (t + 3, H - t - 3), (W - t - 3, H - t - 3)]:
            s += f'<circle cx="{cx}" cy="{cy}" r="8.5" fill="{INK}"/><circle cx="{cx - .5}" cy="{cy - .5}" r="5.6" fill="#f7ecd0"/><circle cx="{cx-1.5}" cy="{cy-1.5}" r="2" fill="#fff" opacity=".8"/>'
    return s + "</svg>"


def ribbon(w=640, h=130):
    t = 8
    tail = 74
    seed = 5
    band = rr_points(tail - 18, 4, w - 2 * tail + 36, h * .62, 12, seed, 2.6)
    s = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{GRAIN}<clipPath id="c"><path d="{path(band)}"/></clipPath></defs>'

    def tailpoly(x0, flip):
        d = -1 if flip else 1

        def xs(v):
            return x0 + d * v
        pts = [(xs(0), h * .22), (xs(tail), h * .22), (xs(tail), h * .9), (xs(tail - 6), h * .9), (xs(tail * .55), h * .62), (xs(0), h * .9 - 2), (xs(18), h * .55)]
        return "M" + " L".join(f"{a:.1f},{b:.1f}" for a, b in pts) + "Z"

    for x0, fl in ((0, False), (w, True)):
        s += f'<path d="{tailpoly(x0, fl)}" fill="#9e3416" stroke="{INK}" stroke-width="{t*.8}" stroke-linejoin="round"/>'
    s += f'<path d="{path(band, 4, 5)}" fill="#000" opacity=".28"/><path d="{path(band)}" fill="{INK}"/>'
    inn = rr_points(tail - 18 + 7, 4 + 7, w - 2 * tail + 36 - 14, h * .62 - 14, 7, seed + 3, 2.0)
    s += f'<path d="{path(inn)}" fill="#e2542b"/><g clip-path="url(#c)"><rect x="0" y="{h*.45:.0f}" width="{w}" height="{h}" fill="#b8381a"/>'
    s += f'<rect x="0" y="0" width="{w}" height="{h}" fill="#fff" filter="url(#gr)" opacity=".4"/>' + hatch(40, 10, w - 80, h * .55, 9, 18, .18, "#5c1c0a") + '</g>'
    s += f'<path d="M{tail+6},{14} L{w*.6:.0f},{14}" stroke="#ffd2a0" stroke-width="3.5" stroke-linecap="round" opacity=".7"/></svg>'
    return s


def write(n, s):
    open(os.path.join(OUT, n + ".svg"), "w", encoding="utf8").write(s)


write("panel", box(480, 320, "#e5cd9c", r=30, t=10, seed=3, inner="#b88f57", studs=True, hat=24))
write("plate", box(360, 150, "#ebd6aa", r=26, t=9, seed=8, inner="#b88f57", hat=10))
write("tile", box(200, 200, "#f4e5c3", r=22, t=8, seed=12, band="#d9bb85", hat=6, bandfrac=.2))
write("bubble", box(400, 220, "#fffdf5", r=34, t=8, seed=17, hat=5))
write("key", box(160, 76, "#f6f0e2", r=18, t=6, sh=4, seed=21, band="#c9c2b2", hat=0, bandfrac=.22))
write("wood", box(400, 128, "#8a5a33", r=28, t=8, sh=5, seed=31, band="#5e3b1f", hat=10, hi=True, bandfrac=.26))
write("gold", box(400, 128, "#ffd25a", r=28, t=8, sh=5, seed=33, band="#d9a21c", hat=8, hi=True, bandfrac=.26))
write("ghost", box(400, 128, "#f6e8c6", r=28, t=8, sh=5, seed=35, band="#d4b47c", hat=8, hi=True, bandfrac=.26))
write("yes", box(170, 170, "#2fb176", r=84, t=9, sh=6, seed=41, band="#136041", hat=8, hi=True, bandfrac=.24))
write("no", box(170, 170, "#e2683f", r=30, t=9, sh=6, seed=43, band="#8c2c10", hat=8, hi=True, bandfrac=.24))
write("ribbon", ribbon())

css = ["/* GENERATED by tools/gen_frames_svg.py - do not edit. SVG sources are resolution independent; slices are px of each SVG's intrinsic size. */", ":root {"]
S = {"panel": "46", "plate": "40", "tile": "36", "bubble": "42", "key": "26", "wood": "30 36 42 36", "gold": "30 36 42 36", "ghost": "30 36 42 36", "ribbon": "0 74 0 74"}
for n in ["panel", "plate", "tile", "bubble", "key", "wood", "gold", "ghost", "ribbon", "yes", "no"]:
    css.append(f"  --fr-{n}: url(/ui/frames/svg/{n}.svg);")
    if n in S:
        css.append(f"  --sl-{n}: {S[n]};")
css.append("}")
open(os.path.join(HERE, "..", "src", "ui-art.css"), "w").write("\n".join(css) + "\n")
print("ok")
