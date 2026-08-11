# Attraccess round badge animation

A 360×360 seamless loop for a round wearable badge, for the Attraccess booth at
Maker Faire Hannover (15.–16. August 2026).

| Output | Size | Notes |
|---|---|---|
| `dist/attraccess-badge-360.gif` | ~1.45 MB, 12.5 fps, 187 frames | 80 ms frame delay, `loop=0` |
| `dist/attraccess-badge-360.mp4` | ~500 KB, 25 fps | H.264 / yuv420p, no audio |

Both are **14.96 s** and loop seamlessly — the last frame steps into the first
with the same magnitude as any other frame pair, so there is no visible stitch.

Two badge limits shape the defaults, and they pull against each other: clips cap
at 15 s, and storage caps somewhere above 1.5 MB but below 2.2 MB. Filling the
full 15 s at 20 fps costs 2.3 MB and does not fit; 12.5 fps gets the same
duration into ~1.45 MB. That is not a smoothness compromise — motion per frame
is `SPEED / fps`, which at 0.762/12.5 matches the earlier, shorter 20 fps cut
almost exactly.

If it still doesn't fit:

| Command | Result |
|---|---|
| `--gif-fps 12.5 --gif-colors 128` | ~1.36 MB |
| `--gif-fps 10 --gif-colors 128` | ~1.13 MB |

Below that, shorten `DURATION` rather than degrading the image further.

## The timeline

It is one continuous piece rather than a slideshow: the **keyhole** from the logo
is the spine that carries through, and every hand-off is a move or a morph.
A rose comet on the rim orbits exactly twice per loop, and a drifting mote field
runs underneath the whole thing — both are phase-driven, so they cross the loop
point without a jump.

Beats are authored on an 11.4 s *story* clock and stretched to fill the badge's
maximum clip length, giving `SPEED = 11.4 / 14.96 = 0.762`. The table below is
story time; divide by 0.762 for playback time.

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

- **Retiming:** set `DURATION` to the target clip length and `SPEED` follows;
  change the scene constants (`A0`…`E1`) for structure. `STORY_DURATION` must
  match the end of the last beat, and every scene's fade-out has to reach zero
  before it. Keep `DURATION * gif_fps` a whole number so the encoded clip length
  matches exactly.
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
