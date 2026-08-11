# Attraccess round badge animation

A 360×360 seamless loop for a round wearable badge, for the Attraccess booth at
Maker Faire Hannover (15.–16. August 2026).

| Output | Size | Notes |
|---|---|---|
| `dist/attraccess-badge-360.gif` | ~1.4 MB, 20 fps, 190 frames | 50 ms frame delay, `loop=0` |
| `dist/attraccess-badge-360.mp4` | ~380 KB, 25 fps | H.264 / yuv420p, no audio |

Both are 9.5 s and loop seamlessly — the last frame steps into the first with
the same magnitude as any other frame pair, so there is no visible stitch.

Badge storage is the binding constraint, so if the default doesn't fit:

| Command | Result |
|---|---|
| `--gif-fps 12.5` | ~1.0 MB |
| `--gif-fps 10 --gif-colors 128` | ~0.77 MB |
| `--gif-fps 8 --gif-colors 128` | ~0.6 MB |

Same animation each time — only the frame count changes.

## The timeline

It is one continuous piece rather than a slideshow: the **keyhole** from the logo
is the spine that carries through, and every hand-off is a move or a morph.
A rose comet on the rim orbits exactly twice per loop, and a drifting mote field
runs underneath the whole thing — both are phase-driven, so they cross the loop
point without a jump.

Beats are authored on an 11.4 s *story* clock and played back at `SPEED = 1.2`,
giving 9.5 s of footage. The table below is story time; divide by 1.2 for
playback time.

| Story time | Beat | What carries over |
|---|---|---|
| 0.0–2.6 s | Keyhole blooms in, mascot rises through it, two scan pulses | — |
| 2.4–5.35 s | Keyhole shrinks and lifts; **Attraccess** wordmark wipes in; *„Dein Schlüssel zum Makerspace"*; attraccess.org | same keyhole, moved |
| 5.2–8.75 s | Keyhole shrinks again into an **Attractap reader** face; card slides in, taps, LED goes green, check draws on, gears spin up. *„Karte scannen." → „Maschine läuft."* + *„Keine Berechtigung, keine Kraft."* | same keyhole, now the reader glyph |
| 8.55–11.4 s | Mascot rises and sways, speech bubble: *„Moin, ich bin Jan Jaap — Frag mich was!"* | mascot returns, unmasked |

The scan beat is the product story (`attraccess.org`: *"No permission, no power"*);
the last beat is the wearer.

## Rebuilding

```bash
pip install Pillow cairosvg
python3 tools/makerfaire-badge/prepare_assets.py   # derives art from flyer-assets.zip
python3 tools/makerfaire-badge/render_badge.py     # writes dist/
```

`prepare_assets.py` pulls the mascot and wordmark straight out of the committed
brand pack (`flyer-assets.zip` → `brand/attraccess-lockup-*.svg`), so no artwork
is duplicated in the tree. Colours come from `brand/brand-colors.json`.

Other useful flags: `--stills 6.35,9.2` dumps single frames as PNG instead of
encoding; `--mp4-fps 30` for smoother video.

`imageio-ffmpeg` supplies the ffmpeg binary if one isn't on `PATH`; without
either, the GIF still builds and only the MP4 step fails.

## Notes for editing

- **Retiming:** change `SPEED` for pace, or the scene constants (`A0`…`E1`) for
  structure. `STORY_DURATION` must match the end of the last beat, and every
  scene's fade-out has to reach zero before it.
- **Layout units are badge pixels** (360×360, centre `180,180`). Everything is
  drawn at 3× and downsampled, so keep coordinates in badge units and let `SS`
  do the work. Keep text inside a radius of about 150 — a round display cuts the
  corners, and the rim carries the orbit comet.
- **Never let a fading element reach the loop point still visible.** Scene
  fade-outs use `ease_in_out_cubic`; `ease_in_cubic` accelerates into the cut
  and pops.
- **Zero-alpha ink is not a no-op in Pillow.** In RGBA draw mode a fully
  transparent fill is written straight into the buffer, punching a hole that
  flattens to black. All drawing goes through the `Pen` wrapper, which drops it.
- **GIF palette:** built with `FASTOCTREE` over 48 sampled frames. Median cut
  splits by population and most of the badge is dark navy, so it starves the
  bright tones — at 128 colours with median cut, the mascot's grey fur and the
  white speech bubble snapped to a green borrowed from the scan scene.
  Dithering is off on purpose: it looks noisier here and roughly quintuples the
  file.
