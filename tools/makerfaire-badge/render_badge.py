"""Render the Attraccess round badge animation.

A 360x360 seamless loop for a round wearable badge display, told as one
continuous timeline rather than a slideshow: the keyhole motif is born, becomes
the brand lockup, morphs into an Attractap reader for the scan-to-start moment,
then hands off to the mascot for the personal greeting before blooming back
into the opening beat.

    python3 tools/makerfaire-badge/prepare_assets.py
    python3 tools/makerfaire-badge/render_badge.py

Outputs ``dist/attraccess-badge-360.gif`` and ``.mp4``.
"""

from __future__ import annotations

import argparse
import math
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "build" / "assets"
FONTS = HERE / "fonts"
BUILD = HERE / "build"   # scratch: derived assets, stills
DIST = HERE / "dist"     # the deliverables themselves

# ---------------------------------------------------------------- canvas ----

SIZE = 360  # badge resolution; all layout maths below is in these units
SS = 3  # supersample factor for the master layer
S = SIZE * SS
GS = S // 2  # glow layers render at half resolution, then blur+upscale
GU = GS / SIZE  # glow-layer units per badge unit

FPS = 25

# Scenes are authored on a "story" clock; playback runs it faster. Keeping the
# two separate means the beat timings below stay readable when the pace changes.
STORY_DURATION = 11.40  # seconds of authored timeline
SPEED = 1.2  # playback multiplier
DURATION = STORY_DURATION / SPEED  # 9.5 s of actual footage per loop

# ---------------------------------------------------------------- palette ---
# Brand values from flyer-assets/brand/brand-colors.json.

BG_CORE = (27, 34, 51)
BG_EDGE = (9, 11, 17)
ROSE = (197, 120, 129)  # marke.rose_keyhole
ROSE_HI = (226, 163, 171)
ROSE_DEEP = (150, 84, 92)
WHITE = (250, 250, 250)
MUTED = (139, 148, 169)
INK = (24, 24, 27)  # marke.wordmark_licht
BLUE = (5, 132, 247)  # ui.primaer_aktion
GREEN = (23, 201, 100)  # ui.erfolg
PANEL = (36, 42, 58)
PANEL_DARK = (22, 26, 37)
LINE = (58, 66, 84)


def rgba(color, alpha=1.0):
    a = int(round(max(0.0, min(1.0, alpha)) * 255))
    return (color[0], color[1], color[2], a)


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


# ---------------------------------------------------------------- easing ----


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def seg(t, a, b):
    """Progress of ``t`` through the window [a, b], clamped to 0..1."""
    return 1.0 if b <= a else clamp((t - a) / (b - a))


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def ease_in_cubic(t):
    return t * t * t


def ease_in_out_cubic(t):
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_back(t, s=1.70158):
    return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2


def ease_out_elastic(t):
    if t <= 0 or t >= 1:
        return clamp(t)
    return 2 ** (-9 * t) * math.sin((t * 10 - 0.75) * (2 * math.pi / 3)) + 1


def bell(t):
    """Smooth 0..1..0 hump over t in 0..1."""
    return math.sin(math.pi * clamp(t)) ** 2


def polar(cx, cy, r, a):
    return (cx + r * math.cos(a), cy + r * math.sin(a))


# ------------------------------------------------------------ primitives ----


class Pen:
    """``ImageDraw`` wrapper that drops fully transparent ink.

    In RGBA draw mode Pillow writes a zero-alpha fill straight into the buffer
    rather than blending it, which punches a transparent hole through the frame
    and shows up as a black patch once the badge is flattened. Elements that
    fade all the way out are routine here, so every draw goes through this.
    """

    __slots__ = ("_d",)

    def __init__(self, im):
        object.__setattr__(self, "_d", ImageDraw.Draw(im, "RGBA"))

    def __getattr__(self, name):
        fn = getattr(self._d, name)

        def wrapped(*args, **kwargs):
            visible = False
            for key in ("fill", "outline"):
                ink = kwargs.get(key)
                if ink is None:
                    continue
                if len(ink) > 3 and ink[3] == 0:
                    kwargs[key] = None
                else:
                    visible = True
            if not visible:
                return None
            return fn(*args, **kwargs)

        return wrapped


def blit(base, img, x, y):
    """Alpha-composite ``img`` onto ``base`` at top-left (x, y), clipping."""
    x, y = int(round(x)), int(round(y))
    bw, bh = base.size
    iw, ih = img.size
    sx0, sy0 = max(0, -x), max(0, -y)
    sx1, sy1 = min(iw, bw - x), min(ih, bh - y)
    if sx0 >= sx1 or sy0 >= sy1:
        return
    if (sx0, sy0, sx1, sy1) != (0, 0, iw, ih):
        img = img.crop((sx0, sy0, sx1, sy1))
    base.alpha_composite(img, (x + sx0, y + sy0))


def blit_center(base, img, cx, cy, unit=SS):
    blit(base, img, cx * unit - img.width / 2, cy * unit - img.height / 2)


def fade(img, alpha):
    """Return ``img`` with its alpha channel scaled by ``alpha``."""
    if alpha >= 1.0:
        return img
    out = img.copy()
    out.putalpha(out.getchannel("A").point(lambda v: int(v * alpha)))
    return out


def scaled(img, height):
    h = max(1, int(round(height)))
    w = max(1, int(round(img.width * h / img.height)))
    return img.resize((w, h), Image.LANCZOS)


_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(name, size):
    key = (name, int(round(size * SS)))
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(str(FONTS / f"{name}.ttf"), key[1])
    return _font_cache[key]


def text_center(draw, cx, cy, s, fnt, fill, tracking=0.0):
    """Centred text with optional letter tracking (badge units)."""
    if not s or fill[3] == 0:
        return
    if tracking == 0:
        draw.text((cx * SS, cy * SS), s, font=fnt, fill=fill, anchor="mm")
        return
    tr = tracking * SS
    widths = [fnt.getlength(c) for c in s]
    x = cx * SS - (sum(widths) + tr * (len(s) - 1)) / 2
    for c, w in zip(s, widths):
        draw.text((x, cy * SS), c, font=fnt, fill=fill, anchor="lm")
        x += w + tr


def ring(draw, cx, cy, r, width, fill, unit=SS):
    """Stroked circle centred on (cx, cy) in badge units."""
    if r <= 0 or width <= 0:
        return
    draw.ellipse(
        [(cx - r) * unit, (cy - r) * unit, (cx + r) * unit, (cy + r) * unit],
        outline=fill,
        width=max(1, int(round(width * unit))),
    )


def gear_points(cx, cy, r_out, r_in, teeth, phase, unit=SS):
    pts = []
    step = 2 * math.pi / teeth
    for i in range(teeth):
        a = phase + i * step
        pts.append(polar(cx, cy, r_in, a))
        pts.append(polar(cx, cy, r_out, a + step * 0.16))
        pts.append(polar(cx, cy, r_out, a + step * 0.34))
        pts.append(polar(cx, cy, r_in, a + step * 0.50))
    return [(x * unit, y * unit) for x, y in pts]


def draw_gear(img, cx, cy, r, phase, fill, teeth=9, hub=0.36, unit=SS):
    """Gear with a genuinely hollow hub (punched out of the alpha channel)."""
    if r <= 1 or fill[3] == 0:
        return
    span = int(math.ceil(r * 1.06 * unit)) * 2 + 4
    layer = Image.new("RGBA", (span, span), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, "RGBA")
    c = span / 2
    d.polygon([(x + c, y + c) for x, y in gear_points(0, 0, r, r * 0.76, teeth, phase, unit)], fill=fill)
    hr = r * hub * unit
    alpha = layer.getchannel("A")
    ImageDraw.Draw(alpha).ellipse([c - hr, c - hr, c + hr, c + hr], fill=0)
    layer.putalpha(alpha)
    blit(img, layer, cx * unit - c, cy * unit - c)


def draw_check(draw, cx, cy, size, prog, fill, width):
    """Checkmark that draws itself on as ``prog`` goes 0..1."""
    if prog <= 0 or fill[3] == 0:
        return
    pts = [(cx - size * 0.42, cy + size * 0.04), (cx - size * 0.10, cy + size * 0.36), (cx + size * 0.45, cy - size * 0.34)]
    lengths = [math.dist(pts[0], pts[1]), math.dist(pts[1], pts[2])]
    total = sum(lengths) * clamp(prog)
    path = [pts[0]]
    for i, seg_len in enumerate(lengths):
        if total <= 0:
            break
        f = min(1.0, total / seg_len)
        a, b = pts[i], pts[i + 1]
        path.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
        total -= seg_len
    if len(path) < 2:
        return
    draw.line([(x * SS, y * SS) for x, y in path], fill=fill, width=max(1, int(width * SS)), joint="curve")


# ------------------------------------------------------------- keyhole ------
# Geometry lifted from the lockup SVG mask (viewBox 7038x2112).

KH_CX, KH_CY, KH_R = 601.858, 601.838, 454.879
KH_TRAP = [(359.571, 871.714), (842.237, 871.714), (963.285, 1966.48), (238.526, 1966.48)]
KH_X0, KH_Y0 = 146.979, 146.959
KH_W, KH_H = 909.758, 1819.521
KH_ASPECT = KH_W / KH_H


_kh_cache: dict[int, Image.Image] = {}


def keyhole_mask(height, aa=4):
    """Anti-aliased L-mode mask of the keyhole glyph, ``height`` px tall."""
    key = max(2, int(round(height)))
    if key in _kh_cache:
        return _kh_cache[key]
    k = key * aa / KH_H
    w, h = max(1, int(round(KH_W * k))), max(1, int(round(KH_H * k)))
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    d.ellipse(
        [(KH_CX - KH_R - KH_X0) * k, (KH_CY - KH_R - KH_Y0) * k, (KH_CX + KH_R - KH_X0) * k, (KH_CY + KH_R - KH_Y0) * k],
        fill=255,
    )
    d.polygon([((x - KH_X0) * k, (y - KH_Y0) * k) for x, y in KH_TRAP], fill=255)
    out = m.resize((max(1, int(round(KH_W * key / KH_H))), key), Image.LANCZOS)
    _kh_cache[key] = out
    return out


# Where the mascot's head sits inside raccoon.png, as a fraction of its own
# box — used to seat the head in the round part of the keyhole.
HEAD_X, HEAD_Y = 0.455, 0.305
HEAD_SCALE = 0.96  # mascot height as a multiple of the keyhole height


def keyhole_sprite(height, color=ROSE, raccoon=None, rise=0.0):
    """Rose keyhole, optionally with the mascot clipped inside it.

    ``rise`` shifts the mascot down by that fraction of the keyhole height, so
    animating it 1 -> 0 makes the raccoon rise into view through the keyhole.
    """
    mask = keyhole_mask(height)
    sprite = Image.new("RGBA", mask.size, color + (255,))
    sprite.putalpha(mask)
    if raccoon is not None:
        # The keyhole's round part is centred at 0.25*height, radius 0.25*height;
        # park the mascot's head right on that centre.
        racc = scaled(raccoon, height * HEAD_SCALE)
        inner = Image.new("RGBA", mask.size, (0, 0, 0, 0))
        blit(
            inner,
            racc,
            mask.width / 2 - racc.width * HEAD_X,
            height * (0.25 + rise) - racc.height * HEAD_Y,
        )
        inner.putalpha(ImageChops.multiply(inner.getchannel("A"), mask))
        sprite.alpha_composite(inner)
    return sprite


# ------------------------------------------------------------ background ----


def build_background():
    """Radial navy gradient, precomputed once."""
    g = Image.new("RGB", (SIZE, SIZE))
    px = g.load()
    cx = cy = (SIZE - 1) / 2
    maxd = math.hypot(cx, cy)
    for y in range(SIZE):
        for x in range(SIZE):
            d = math.hypot(x - cx, y - cy) / maxd
            px[x, y] = mix(BG_CORE, BG_EDGE, d ** 1.35)
    return g.resize((S, S), Image.BICUBIC).convert("RGBA")


def build_badge_mask():
    """Feathered circular mask so the loop sits cleanly on a round display."""
    aa = 2
    m = Image.new("L", (S * aa, S * aa), 0)
    ImageDraw.Draw(m).ellipse([0, 0, S * aa - 1, S * aa - 1], fill=255)
    return m.resize((S, S), Image.LANCZOS)


# ------------------------------------------------------- ambient elements ---

PARTICLE_WRAP = SIZE + 40  # drift period, in badge units

_rng = random.Random(20260815)
PARTICLES = [
    {
        "x": _rng.uniform(10, SIZE - 10),
        "y0": _rng.uniform(0, SIZE),
        "k": _rng.choice([1, 1, 2]),
        "r": _rng.uniform(0.7, 2.3),
        "a": _rng.uniform(0.10, 0.42),
        "sway": _rng.uniform(3, 9),
        "m": _rng.choice([1, 2]),
        "ph": _rng.uniform(0, 1),
        "c": _rng.choice([ROSE, ROSE, WHITE, BLUE]),
    }
    for _ in range(52)
]


def draw_particles(draw, prog):
    """Slow drifting motes. Motion is a whole number of wraps per loop, so the
    field is perfectly continuous across the seam."""
    for p in PARTICLES:
        # Travel per loop is a whole number of wrap periods, so the field is
        # continuous across the seam rather than jumping.
        y = (p["y0"] - p["k"] * PARTICLE_WRAP * prog) % PARTICLE_WRAP - 20
        x = p["x"] + p["sway"] * math.sin(2 * math.pi * (p["m"] * prog + p["ph"]))
        r = p["r"]
        draw.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=rgba(p["c"], p["a"]))


def draw_orbit(draw, prog):
    """Faint rail plus a two-revolution comet — an ambient loop-progress cue."""
    ring(draw, 180, 180, 171.5, 1.1, rgba(LINE, 0.55))
    head = -90 + 720 * prog
    for i in range(34):
        f = i / 33
        a = math.radians(head - f * 62)
        x, y = polar(180, 180, 171.5, a)
        r = 1.9 * (1 - f * 0.55)
        col = mix(ROSE_HI, ROSE_DEEP, f)
        draw.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=rgba(col, (1 - f) ** 1.6))


# ---------------------------------------------------------------- scenes ----
# Windows overlap deliberately: every hand-off is a move or a morph, never a cut.

A0, A1 = 0.00, 2.60  # wake — the keyhole is born
B0, B1 = 2.40, 5.35  # brand — lockup, claim, url
C0, C1 = 5.20, 8.75  # scan — card taps the reader, machine runs
E0, E1 = 8.55, 11.40  # me — the greeting


def keyhole_state(t):
    """Shared keyhole transform across scenes A, B and C (the morph spine)."""
    # A: hero size, centred.  B: shrinks and lifts for the lockup.
    # C: shrinks again into the reader's face glyph.
    h = 208.0
    cy = 179.0
    if t >= B0:
        p = ease_in_out_cubic(seg(t, B0, 3.15))
        h += (128 - 208) * p
        cy += (132 - 179) * p
    if t >= C0:
        p = ease_in_out_cubic(seg(t, C0, 5.95))
        h += (58 - 128) * p
        cy += (150 - 132) * p
    return h, cy


def scene_wake(main, glow, dm, dg, t, assets):
    """0.0-2.6s — bloom, keyhole snaps in, mascot rises, scan pulses."""
    # Seam bloom: wrapped time keeps it continuous across the loop point.
    tb = t if t < 2.0 else t - STORY_DURATION
    if -0.5 < tb < 0.85:
        a = bell(seg(tb, -0.5, 0.85)) * 0.85
        r = 30 + 120 * seg(tb, -0.5, 0.85)
        dg.ellipse([(180 - r) * GU, (180 - r) * GU, (180 + r) * GU, (180 + r) * GU], fill=rgba(ROSE, 0.5 * a))

    if t > A1 + 0.2:
        return

    pop = ease_out_back(seg(t, 0.22, 1.05))
    if pop <= 0:
        return
    h, cy = keyhole_state(t)
    rise = 1.0 - ease_out_cubic(seg(t, 0.55, 1.35))
    sprite = keyhole_sprite(h * pop * SS, raccoon=assets["raccoon"], rise=rise * 0.55)

    # Soft rose halo behind the keyhole.
    halo = 0.55 * clamp(seg(t, 0.25, 0.9))
    dg.ellipse([(180 - 74) * GU, (cy - 92) * GU, (180 + 74) * GU, (cy + 92) * GU], fill=rgba(ROSE, halo * 0.45))

    blit_center(main, sprite, 180, cy)

    # Two expanding scan pulses.
    for start in (0.95, 1.65):
        p = seg(t, start, start + 0.95)
        if 0 < p < 1:
            r = 34 + 138 * ease_out_cubic(p)
            ring(dm, 180, cy, r, 1.6, rgba(ROSE_HI, (1 - p) ** 1.7 * 0.75))


def scene_brand(main, glow, dm, dg, t, assets):
    """2.4-5.35s — the lockup assembles: keyhole above, wordmark wipes in."""
    if not (B0 <= t <= B1 + 0.2):
        return
    out = 1 - ease_in_out_cubic(seg(t, 5.00, B1))

    h, cy = keyhole_state(t)
    if t >= A1:  # scene A still owns the keyhole until its window closes
        rise = 0.0
        blit_center(main, fade(keyhole_sprite(h * SS, raccoon=assets["raccoon"], rise=rise), out), 180, cy)
        dg.ellipse([(180 - 52) * GU, (cy - 66) * GU, (180 + 52) * GU, (cy + 66) * GU], fill=rgba(ROSE, 0.28 * out))

    # Wordmark: soft left-to-right wipe with a slight settle upward.
    wp = ease_out_cubic(seg(t, 2.95, 3.85))
    if wp > 0:
        wm = scaled(assets["wordmark"], 27 * SS)
        mask = Image.new("L", wm.size, 0)
        edge = int(wm.width * 0.10)
        cut = int(wm.width * wp)
        ImageDraw.Draw(mask).rectangle([0, 0, max(0, cut - edge), wm.size[1]], fill=255)
        if edge > 0 and cut > 0:  # feathered leading edge
            for i in range(edge):
                x = cut - edge + i
                if 0 <= x < wm.width:
                    ImageDraw.Draw(mask).line([x, 0, x, wm.height], fill=int(255 * (1 - i / edge)))
        wm = wm.copy()
        wm.putalpha(ImageChops.multiply(wm.getchannel("A"), mask))
        blit_center(main, fade(wm, out), 180, 241 + 6 * (1 - wp))

    cp = ease_out_cubic(seg(t, 3.65, 4.30))
    if cp > 0:
        text_center(dm, 180, 277 + 5 * (1 - cp), "Dein Schlüssel zum Makerspace", font("Outfit-Regular", 14.5), rgba(MUTED, cp * out))

    up = ease_out_cubic(seg(t, 4.10, 4.65))
    if up > 0:
        text_center(dm, 180, 302 + 4 * (1 - up), "attraccess.org", font("Outfit-Bold", 13.5), rgba(ROSE_HI, up * out))


def scene_scan(main, glow, dm, dg, t, assets):
    """5.2-8.75s — the product beat: card taps the reader, the machine runs."""
    if not (C0 <= t <= C1 + 0.2):
        return
    out = 1 - ease_in_out_cubic(seg(t, 8.35, C1))
    tap = 6.35
    tapped = t >= tap

    body = ease_out_cubic(seg(t, C0, 5.85))
    if body <= 0:
        return

    # --- reader body (an Attractap terminal) -------------------------------
    rx, ry, rw, rh = 180, 158, 104, 132
    sc = 0.82 + 0.18 * body
    w2, h2 = rw * sc / 2, rh * sc / 2
    box = [(rx - w2) * SS, (ry - h2) * SS, (rx + w2) * SS, (ry + h2) * SS]
    dm.rounded_rectangle(box, radius=17 * SS, fill=rgba(PANEL, body * out), outline=rgba(LINE, body * out), width=int(1.6 * SS))
    inset = [box[0] + 9 * SS, box[1] + 9 * SS, box[2] - 9 * SS, box[3] - 9 * SS]
    dm.rounded_rectangle(inset, radius=11 * SS, fill=rgba(PANEL_DARK, body * out))

    # --- keyhole glyph on the reader face (morph target from scene B) ------
    h, cy = keyhole_state(t)
    glyph_col = mix(ROSE, GREEN, ease_out_cubic(seg(t, tap, tap + 0.45)))
    kh = keyhole_sprite(h * SS, color=glyph_col)
    blit_center(main, fade(kh, out), 180, cy)

    # --- status LED (top of the face, clear of where the card lands) -------
    led = mix((206, 68, 68), GREEN, ease_out_cubic(seg(t, tap, tap + 0.3)))
    pulse = 0.55 + 0.45 * math.sin(t * (12 if tapped else 5))
    ly, lr = 112.0, 4.0
    dm.ellipse([(180 - lr) * SS, (ly - lr) * SS, (180 + lr) * SS, (ly + lr) * SS], fill=rgba(led, body * out))
    dg.ellipse([(180 - 13) * GU, (ly - 13) * GU, (180 + 13) * GU, (ly + 13) * GU], fill=rgba(led, 0.5 * pulse * body * out))

    # --- the card ----------------------------------------------------------
    cp = seg(t, 5.72, tap)
    if cp > 0 and t < 7.35:
        e = ease_out_cubic(cp)
        cx = 30 + (146 - 30) * e
        ccy = 258 + (208 - 258) * e
        ang = -20 + 13 * e
        if tapped:  # small recoil, then hold
            k = ease_out_elastic(seg(t, tap, tap + 0.6))
            cx += 5 * k
            ccy += 7 * k
            ang += 3 * k
        card = build_card(assets)
        card = card.rotate(-ang, resample=Image.BICUBIC, expand=True)
        blit_center(main, fade(card, out * (1 - seg(t, 6.95, 7.35))), cx, ccy)

    # --- the tap: ripples, flash, confirmation ----------------------------
    if tapped:
        for i, start in enumerate((tap, tap + 0.22, tap + 0.44)):
            p = seg(t, start, start + 0.85)
            if 0 < p < 1:
                r = 12 + 118 * ease_out_cubic(p)
                ring(dm, 180, 158, r, 1.8, rgba(GREEN, (1 - p) ** 1.8 * 0.7 * out))
        flash = (1 - seg(t, tap, tap + 0.28)) ** 2
        if flash > 0.01:
            dg.ellipse([(180 - 82) * GU, (158 - 82) * GU, (180 + 82) * GU, (158 + 82) * GU], fill=rgba(GREEN, 0.30 * flash))
        draw_check(dm, 180, 150, 30, seg(t, tap + 0.18, tap + 0.55), rgba(WHITE, out), 4.2)

    # --- the machine spins up ---------------------------------------------
    gp = ease_out_cubic(seg(t, 6.62, 7.35))
    if gp > 0:
        for cxg, cyg, rg, spin in ((92, 96, 30, 1.0), (268, 108, 21, -1.45)):
            draw_gear(main, cxg, cyg, rg * gp, (t - 6.62) * spin, rgba(mix(LINE, ROSE, 0.25), 0.95 * gp * out))

    # --- caption swaps mid-scene ------------------------------------------
    pre = clamp(seg(t, 5.92, 6.20)) * (1 - seg(t, tap, tap + 0.18))
    if pre > 0.01:
        text_center(dm, 180, 278, "Karte scannen.", font("Outfit-Bold", 19), rgba(WHITE, pre * out))
    post = ease_out_cubic(seg(t, tap + 0.16, tap + 0.5))
    if post > 0.01:
        text_center(dm, 180, 278 + 6 * (1 - post), "Maschine läuft.", font("Outfit-Bold", 19), rgba(GREEN, post * out))
        text_center(dm, 180, 300, "Keine Berechtigung, keine Kraft.", font("Outfit-Regular", 11.5), rgba(MUTED, post * out * clamp(seg(t, 6.9, 7.3))))


def build_card(assets):
    """An NFC member card sprite, drawn once per call at supersampled size."""
    w, h = int(78 * SS), int(50 * SS)
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(card, "RGBA")
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=8 * SS, fill=rgba(ROSE, 1.0), outline=rgba(ROSE_HI, 1.0), width=int(1.4 * SS))
    # NFC waves
    for i in range(3):
        r = (7 + i * 7) * SS
        d.arc([w * 0.30 - r, h / 2 - r, w * 0.30 + r, h / 2 + r], -52, 52, fill=rgba(WHITE, 0.92 - i * 0.16), width=int(1.7 * SS))
    d.ellipse([w * 0.30 - 2.2 * SS, h / 2 - 2.2 * SS, w * 0.30 + 2.2 * SS, h / 2 + 2.2 * SS], fill=rgba(WHITE, 0.95))
    kh = keyhole_sprite(20 * SS, color=(255, 255, 255))
    blit(card, fade(kh, 0.85), w * 0.72 - kh.width / 2, h / 2 - kh.height / 2)
    return card


def scene_me(main, glow, dm, dg, t, assets):
    """8.55-11.4s — the mascot hands over to the person wearing the badge."""
    if t < E0:
        return
    # Must reach zero *before* the loop point, or the mascot pops on the seam.
    out = 1 - ease_in_out_cubic(seg(t, 10.62, 11.35))

    # Mascot rises from the bottom with a friendly sway.
    rp = ease_out_cubic(seg(t, E0, 9.32))
    if rp > 0:
        sway = math.sin((t - E0) * 3.1) * 2.6
        bob = math.sin((t - E0) * 2.2) * 2.0
        racc = scaled(assets["raccoon"], 190 * SS)
        racc = racc.rotate(sway, resample=Image.BICUBIC, expand=True)
        cx, cy = 150, 262 + (1 - rp) * 120 + bob
        blit_center(main, fade(racc, out), cx, cy)

    # Speech bubble.
    bp = ease_out_back(seg(t, 9.02, 9.58))
    if bp <= 0:
        return
    bcx, bcy, bw, bh = 200, 111, 182, 98
    w2, h2 = bw * bp / 2, bh * bp / 2
    alpha = clamp(seg(t, 9.02, 9.35)) * out
    dm.rounded_rectangle(
        [(bcx - w2) * SS, (bcy - h2) * SS, (bcx + w2) * SS, (bcy + h2) * SS],
        radius=17 * SS,
        fill=rgba(WHITE, alpha),
    )
    if bp > 0.85:  # tail toward the mascot's head
        tail = [(bcx - w2 + 26, bcy + h2 - 3), (bcx - w2 + 8, bcy + h2 + 20), (bcx - w2 + 52, bcy + h2 - 3)]
        dm.polygon([(x * SS, y * SS) for x, y in tail], fill=rgba(WHITE, alpha))

    tp = ease_out_cubic(seg(t, 9.38, 9.80))
    if tp > 0:
        a = tp * out
        text_center(dm, bcx, 84, "Moin, ich bin", font("Outfit-Regular", 13.5), rgba((90, 96, 112), a))
        text_center(dm, bcx, 111, "Jan Jaap", font("Outfit-Bold", 26), rgba(INK, a))
        p2 = ease_out_cubic(seg(t, 9.74, 10.16))
        text_center(dm, bcx, 138, "Frag mich was!", font("Outfit-Bold", 14), rgba(ROSE_DEEP, p2 * out))


SCENES = (scene_wake, scene_brand, scene_scan, scene_me)


# ------------------------------------------------------------ compositing ---


def render_frame(t, assets):
    """``t`` is playback time; scenes are authored in story time (see SPEED)."""
    st = (t % DURATION) * SPEED
    prog = st / STORY_DURATION
    main = assets["bg"].copy()
    glow = Image.new("RGBA", (GS, GS), (0, 0, 0, 0))
    dm = Pen(main)
    dg = Pen(glow)

    draw_particles(dm, prog)
    for scene in SCENES:
        scene(main, glow, dm, dg, st, assets)
    draw_orbit(dm, prog)

    # Blur and lay the accumulated glow underneath-ish (additive-looking bloom).
    glow = glow.filter(ImageFilter.GaussianBlur(GS * 0.028))
    main = Image.alpha_composite(main, glow.resize((S, S), Image.BILINEAR))

    main.putalpha(ImageChops.multiply(main.getchannel("A"), assets["mask"]))
    flat = Image.new("RGB", (S, S), (0, 0, 0))
    flat.paste(main, (0, 0), main)
    return flat.resize((SIZE, SIZE), Image.LANCZOS)


def load_assets():
    if not (ASSETS / "raccoon.png").exists():
        raise SystemExit("assets missing — run prepare_assets.py first")
    return {
        "raccoon": Image.open(ASSETS / "raccoon.png").convert("RGBA"),
        "wordmark": Image.open(ASSETS / "wordmark.png").convert("RGBA"),
        "bg": build_background(),
        "mask": build_badge_mask(),
    }


# --------------------------------------------------------------- encoding ---


PALETTE_SAMPLES = 48


def write_gif(frames, path, fps, colors=256):
    """Quantise every frame against one shared palette so the loop doesn't
    shimmer, then let Pillow store inter-frame deltas.

    Dithering is deliberately off: error diffusion re-randomises flat areas on
    every frame, which both looks noisier here and roughly quintuples the file.
    Disposal 1 (leave in place) lets the optimiser ship only changed regions.

    The palette is built with FASTOCTREE over a wide sample. Median cut splits
    by population, and since most of the badge is dark navy it starves the few
    bright tones — at 128 colours the mascot's neutral grey fur and the speech
    bubble snapped to a green from the scan scene.
    """
    n = min(PALETTE_SAMPLES, len(frames))
    strip = Image.new("RGB", (SIZE, SIZE * n))
    for i in range(n):
        strip.paste(frames[int(i * len(frames) / n)], (0, i * SIZE))
    pal = strip.quantize(colors=colors, method=Image.FASTOCTREE)
    conv = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    conv[0].save(
        path,
        save_all=True,
        append_images=conv[1:],
        duration=int(round(1000 / fps)),
        loop=0,
        disposal=1,
        optimize=True,
    )


def write_mp4(frames, path, fps):
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = "ffmpeg"
    cmd = [
        exe, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{SIZE}x{SIZE}", "-r", str(fps),
        "-i", "-",
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
        "-movflags", "+faststart", str(path),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames:
        proc.stdin.write(f.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg failed")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    # 20 fps keeps the GIF frame delay at a round 50 ms, which badge firmware
    # honours more reliably than 40 ms; the MP4 has no such constraint.
    ap.add_argument("--gif-fps", type=float, default=20)
    ap.add_argument("--mp4-fps", type=float, default=FPS)
    ap.add_argument("--gif-colors", type=int, default=256)
    ap.add_argument("--stills", help="comma-separated timestamps to dump as PNG instead of encoding")
    args = ap.parse_args()

    BUILD.mkdir(parents=True, exist_ok=True)
    DIST.mkdir(parents=True, exist_ok=True)
    assets = load_assets()

    if args.stills:
        for spec in args.stills.split(","):
            t = float(spec)
            out = BUILD / f"still-{t:05.2f}.png"
            render_frame(t, assets).save(out)
            print(out)
        return

    def sequence(fps):
        total = int(round(DURATION * fps))
        out = []
        for i in range(total):
            out.append(render_frame(i / fps, assets))
            if (i + 1) % 50 == 0 or i + 1 == total:
                print(f"  {fps:g} fps: {i + 1}/{total}", flush=True)
        return out

    gif = DIST / "attraccess-badge-360.gif"
    mp4 = DIST / "attraccess-badge-360.mp4"

    frames = sequence(args.gif_fps)
    write_gif(frames, gif, args.gif_fps, args.gif_colors)
    if args.mp4_fps != args.gif_fps:
        frames = sequence(args.mp4_fps)
    write_mp4(frames, mp4, args.mp4_fps)

    for p, fps in ((gif, args.gif_fps), (mp4, args.mp4_fps)):
        print(f"{p.name}  {p.stat().st_size / 1024:.0f} KB  @{fps:g} fps")


if __name__ == "__main__":
    main()
