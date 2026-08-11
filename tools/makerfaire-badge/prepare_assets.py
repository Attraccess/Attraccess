"""Derive the badge animation's image assets from the committed brand pack.

Everything is extracted from ``flyer-assets.zip`` at the repository root, so no
binary art needs to live twice in the tree. Produces, in ``build/assets``:

    raccoon.png    the waving lab-coat raccoon, alpha-trimmed (~1840px)
    wordmark.png   the "Attraccess" wordmark in white, alpha-trimmed

Run via ``python3 tools/makerfaire-badge/prepare_assets.py``.
"""

from __future__ import annotations

import base64
import io
import re
import zipfile
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ZIP = ROOT / "flyer-assets.zip"
OUT = Path(__file__).resolve().parent / "build" / "assets"

# The colour lockup embeds the full mascot as a 2048px RGBA raster; the dark
# lockup carries the wordmark as vector paths already coloured white.
COLOR_SVG = "flyer-assets/brand/attraccess-lockup-color.svg"
DARK_SVG = "flyer-assets/brand/attraccess-lockup-dark.svg"

# The lockup viewBox is 7038x2112 and the keyhole glyph occupies x < 1057.
# Cropping past it isolates the wordmark.
KEYHOLE_END_FRACTION = 1100 / 7038


def _read(zf: zipfile.ZipFile, name: str) -> str:
    return zf.read(name).decode("utf-8")


def extract_raccoon(zf: zipfile.ZipFile) -> Image.Image:
    """Pull the embedded mascot raster out of the colour lockup SVG."""
    svg = _read(zf, COLOR_SVG)
    match = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", svg)
    if not match:
        raise RuntimeError(f"no embedded PNG found in {COLOR_SVG}")
    img = Image.open(io.BytesIO(base64.b64decode(match.group(1)))).convert("RGBA")
    return img.crop(img.getchannel("A").getbbox())


def extract_wordmark(zf: zipfile.ZipFile, width: int = 4000) -> Image.Image:
    """Render the white wordmark from the dark lockup and trim the keyhole off."""
    png = cairosvg.svg2png(bytestring=_read(zf, DARK_SVG).encode("utf-8"), output_width=width)
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    img = img.crop((int(width * KEYHOLE_END_FRACTION), 0, img.width, img.height))
    return img.crop(img.getchannel("A").getbbox())


def main() -> None:
    if not ZIP.exists():
        raise SystemExit(f"missing brand pack: {ZIP}")
    OUT.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(ZIP) as zf:
        raccoon = extract_raccoon(zf)
        wordmark = extract_wordmark(zf)

    raccoon.save(OUT / "raccoon.png")
    wordmark.save(OUT / "wordmark.png")
    print(f"raccoon.png  {raccoon.size}")
    print(f"wordmark.png {wordmark.size}")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
