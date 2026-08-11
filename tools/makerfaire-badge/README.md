# Maker Faire Hannover 2026 — round badge animation

A 360×360 seamless loop for a round wearable badge, worn at the Attraccess booth
at **Maker Faire Hannover, 15.–16. August 2026** (HCC).

| Output | Size | Notes |
|---|---|---|
| `dist/attraccess-badge-360.gif` | ~2.1 MB, 20 fps, 280 frames | 50 ms frame delay, `loop=0` |
| `dist/attraccess-badge-360.mp4` | ~540 KB, 25 fps | H.264 / yuv420p, no audio |

Both are 14.0 s and loop seamlessly — the last frame steps into the first with
the same magnitude as any other frame pair, so there is no visible stitch.

## The timeline

It is one continuous piece rather than a slideshow: the **keyhole** from the logo
is the spine that carries through, and every hand-off is a move or a morph.
A rose comet on the rim orbits exactly twice per loop, and a drifting mote field
runs underneath the whole thing — both are phase-driven, so they cross the loop
point without a jump.

| Time | Beat | What carries over |
|---|---|---|
| 0.0–2.6 s | Keyhole blooms in, mascot rises through it, two scan pulses | — |
| 2.4–5.3 s | Keyhole shrinks and lifts; **Attraccess** wordmark wipes in; claim *„Dein Schlüssel zum Makerspace"* | same keyhole, moved |
| 5.2–8.7 s | Keyhole shrinks again into an **Attractap reader** face; card slides in, taps, LED goes green, check draws on, gears spin up. *„Karte scannen." → „Maschine läuft."* + *„Keine Berechtigung, keine Kraft."* | same keyhole, now the reader glyph |
| 8.5–11.3 s | Gears grow into the background; **MAKER FAIRE HANNOVER**, 15.–16. AUGUST 2026, attraccess.org, confetti | same gears, grown |
| 11.2–14.0 s | Mascot rises and sways, speech bubble: *„Moin, ich bin Jan Jaap — Frag mich was!"* | mascot returns, unmasked |

The scan beat is the product story (`attraccess.org`: *"No permission, no power"*),
the fair beat is the where-and-when, the last beat is the wearer.

## Rebuilding

```bash
pip install Pillow cairosvg
python3 tools/makerfaire-badge/prepare_assets.py   # derives art from flyer-assets.zip
python3 tools/makerfaire-badge/render_badge.py     # writes dist/
```

`prepare_assets.py` pulls the mascot and wordmark straight out of the committed
brand pack (`flyer-assets.zip` → `brand/attraccess-lockup-*.svg`), so no artwork
is duplicated in the tree. Colours come from `brand/brand-colors.json`.

Useful flags:

```bash
--stills 6.35,12.3      # dump single frames as PNG instead of encoding
--gif-fps 12.5          # smaller file if badge storage is tight (~1.3 MB)
--mp4-fps 30            # smoother video
--gif-colors 128        # see the palette note below before lowering this
```

`imageio-ffmpeg` supplies the ffmpeg binary if one isn't on `PATH`; without
either, the GIF still builds and only the MP4 step fails.

## Notes for editing

- **Layout units are badge pixels** (360×360, centre `180,180`). Everything is
  drawn at 3× and downsampled, so keep coordinates in badge units and let `SS`
  do the work. Keep text inside a radius of about 150 — a round display cuts the
  corners, and the rim carries the orbit comet.
- **Never let a fading element reach the loop point still visible.** Scene
  fade-outs use `ease_in_out_cubic` and finish before 14.0 s; `ease_in_cubic`
  accelerates into the cut and pops.
- **Zero-alpha ink is not a no-op in Pillow.** In RGBA draw mode a fully
  transparent fill is written straight into the buffer, punching a hole that
  flattens to black. All drawing goes through the `Pen` wrapper, which drops it.
- **GIF palette:** built with `FASTOCTREE` over 48 sampled frames. Median cut
  splits by population and most of the badge is dark navy, so it starves the
  bright tones — at 128 colours the mascot's grey fur and the white speech
  bubble snapped to a green borrowed from the scan scene. Dithering is off on
  purpose: it looks noisier here and roughly quintuples the file.
