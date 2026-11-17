#!/usr/bin/env python3
"""Generates ink mountains (outline, white interior, shaded side with hatching, faded base)
in public/assets/generated/mountains/. Original drawing, no third-party license.

Usage: python3 scripts/generate-mountains.py [count] [seed]
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'generated' / 'mountains'
W, H, SS = 560, 300, 3
INK, SHADE, HATCH = 40, 205, 70  # gray tones: stroke, shaded side, hatching


def jag(rng, a, b, rough, depth=6):
    """Jagged line between a and b (midpoint displacement)."""
    pts = [a, b]
    for d in range(depth):
        out = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            L = math.dist(p, q)
            nx, ny = -(q[1] - p[1]) / (L or 1), (q[0] - p[0]) / (L or 1)
            o = rng.gauss(0, rough * L)
            out += [(mx + nx * o, my + ny * o), q]
        pts = out
    return pts


def stroke(d, pts, w, rng, tone):
    for p, q in zip(pts, pts[1:]):
        r = max(0.6, w * rng.uniform(0.75, 1.15)) / 2
        n = max(1, int(math.dist(p, q) / 0.8))
        for i in range(n + 1):
            x = p[0] + (q[0] - p[0]) * i / n
            y = p[1] + (q[1] - p[1]) * i / n
            d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=tone)


def mountain(seed):
    rng = random.Random(seed)
    base = H * 0.86
    x0, x1 = W * rng.uniform(0.03, 0.1), W * rng.uniform(0.9, 0.97)
    n = rng.choice([1, 1, 2, 2, 3])
    xs = sorted(rng.uniform(x0 + (x1 - x0) * 0.25, x1 - (x1 - x0) * 0.25) for _ in range(n))
    peaks = [(x, base - H * rng.uniform(0.6, 0.8) * (1 if i == n // 2 else rng.uniform(0.6, 0.85))) for i, x in enumerate(xs)]
    # silhouette: left base -> peaks (with saddles between them) -> right base
    keys = [(x0, base)]
    for i, p in enumerate(peaks):
        if i:
            a = peaks[i - 1]
            keys.append(((a[0] + p[0]) / 2, max(a[1], p[1]) + H * rng.uniform(0.1, 0.22)))
        keys.append(p)
    keys.append((x1, base))
    ridge = [keys[0]]
    for a, b in zip(keys, keys[1:]):
        ridge += jag(rng, a, b, 0.07)[1:]

    fill = Image.new('L', (W * SS, H * SS), 0)   # shape (alpha)
    tone = Image.new('L', (W * SS, H * SS), 255)  # gray tone
    df, dt = ImageDraw.Draw(fill), ImageDraw.Draw(tone)
    poly = [(x * SS, y * SS) for x, y in ridge] + [(x1 * SS, (base + 6) * SS), (x0 * SS, (base + 6) * SS)]
    df.polygon(poly, fill=255)

    # right side of each peak in shadow (soft), with hatching parallel to the ridge; secondary ridges
    spines, subs = [], []
    hatch = Image.new('L', fill.size, 255)
    dh = ImageDraw.Draw(hatch)
    shade_all = Image.new('L', fill.size, 0)
    for p in peaks:
        foot = (p[0] + (x1 - p[0]) * rng.uniform(0.2, 0.45), base + 4)
        spine = jag(rng, p, foot, 0.05, 5)
        spines.append(spine)
        right = [q for q in ridge if q[0] > p[0] and q[1] <= base]
        shade = [(x * SS, y * SS) for x, y in spine] + [(x1 * SS, base * SS)] + [(x * SS, y * SS) for x, y in reversed(right)]
        ImageDraw.Draw(shade_all).polygon(shade, fill=255)
        # hatching: starts at the ridge and runs down the shaded slope
        for k in range(2, len(spine) - 2):
            sx, sy = spine[k]
            ang = math.atan2(foot[1] - p[1], foot[0] - p[0]) - math.radians(rng.uniform(18, 32))
            ln = rng.uniform(14, 34) * (1 - k / len(spine) * 0.5)
            stroke(dh, [(sx + 2.5, sy + 1), (sx + 2.5 + ln * math.cos(ang), sy + 1 + ln * math.sin(ang))], 1.3, rng, HATCH)
        # secondary ridges on the lit side, with short hatching
        for _ in range(rng.randint(1, 2)):
            cand = [q for q in ridge if q[0] < p[0] - 20 and q[1] < base - H * 0.18]
            if not cand:
                break
            a = rng.choice(cand)
            b = (a[0] + rng.uniform(15, 45), a[1] + rng.uniform(30, 70))
            sub = jag(rng, a, (b[0], min(b[1], base - 8)), 0.08, 4)
            subs.append(sub)
            for q in sub[1:-1:2]:
                stroke(dh, [(q[0] + 2, q[1]), (q[0] + 2 + rng.uniform(6, 14), q[1] + rng.uniform(8, 16))], 1.1, rng, HATCH)
    shade_all = ImageChops.multiply(shade_all, fill)
    # darker shadow near the ridge, lightening down the slope
    near = Image.new('L', fill.size, 0)
    dn = ImageDraw.Draw(near)
    for sp in spines:
        stroke(dn, sp, 34, rng, 255)
    for sp in subs:
        stroke(dn, sp, 14, rng, 150)
    near = near.filter(ImageFilter.GaussianBlur(14 * SS))
    base_shade = shade_all.point(lambda v: v * 0.35)
    side = shade_all.filter(ImageFilter.GaussianBlur(2 * SS)).point(lambda v: 60 + v * 0.77)  # light from the left
    shading = ImageChops.multiply(near.point(lambda v: min(255, v * 1.6)), side)
    tone.paste(SHADE, mask=ImageChops.multiply(ImageChops.lighter(shading, base_shade), fill))
    # short hatching just below the outline, on the shaded slope
    for a, b in zip(ridge[::3], ridge[3::3]):
        if b[1] > a[1] and rng.random() < 0.7 and a[1] < base - 12:
            ang = math.atan2(b[1] - a[1], b[0] - a[0]) + math.radians(rng.uniform(25, 40))
            ln = rng.uniform(7, 16)
            stroke(dh, [(a[0] - 1, a[1] + 3), (a[0] - 1 + ln * math.cos(ang), a[1] + 3 + ln * math.sin(ang))], 1.2, rng, HATCH)
    hm = ImageChops.multiply(ImageChops.invert(hatch), fill)
    tone.paste(hatch, mask=hm)

    ink = Image.new('L', fill.size, 255)
    di = ImageDraw.Draw(ink)
    for i, (p, q) in enumerate(zip(ridge, ridge[1:])):  # thicker outline at the top, thinning toward the base
        w = 2.2 + 3.4 * max(0.0, (base - min(p[1], q[1])) / (H * 0.6))
        stroke(di, [p, q], w, rng, INK)
    for sp in spines:
        stroke(di, sp[: int(len(sp) * rng.uniform(0.55, 0.8))], 2.2, rng, INK)
    for sp in subs:
        stroke(di, sp[: int(len(sp) * 0.8)], 1.6, rng, INK)
    inkmask = ImageChops.invert(ink)
    tone.paste(ink, mask=inkmask)
    alpha = ImageChops.lighter(fill, inkmask.point(lambda v: 255 if v > 0 else 0))

    # faded base, like mist
    fade = Image.new('L', fill.size, 255)
    dfa = ImageDraw.Draw(fade)
    top = (base - H * 0.16) * SS
    for y in range(int(top), H * SS):
        v = max(0, 255 - int(255 * (y - top) / ((H * SS) - top) * 1.15))
        dfa.line([(0, y), (W * SS, y)], fill=v)
    fade = fade.filter(ImageFilter.GaussianBlur(4 * SS))
    alpha = ImageChops.multiply(alpha, fade)
    tone = Image.composite(tone, Image.new('L', tone.size, 255), fade.point(lambda v: 255 if v > 180 else int(v * 1.2)))

    im = Image.merge('RGBA', (tone, tone, tone, alpha)).resize((W, H), Image.LANCZOS)
    return im.crop(im.getbbox())


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        mountain(seed + i).save(OUT / f'{i + 1:02d}.png', optimize=True)
    print(f'{n} mountains generated in {OUT}')
