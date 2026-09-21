#!/usr/bin/env python3
# Slices the tab-icon sprite strips into one PNG per frame. DESIGN 10.3
# Run after replacing a strip: python scripts/split-favicon-frames.py

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "public" / "assets" / "favicon"
OUT = SRC / "frames"

# Must match FAVICON_SPRITES in frontend/src/lib/favicon.ts.
STRIPS = {
    "earth-spin": 48,
    "earth-pixel": 8,
    "earth-prime": 36,
}
CELL = 32


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, frames in STRIPS.items():
        sheet = Image.open(SRC / f"{name}.png").convert("RGBA")
        expected = frames * CELL
        if sheet.width != expected or sheet.height != CELL:
            sys.exit(f"{name}.png is {sheet.width}x{sheet.height}, expected {expected}x{CELL}")
        for i in range(frames):
            cell = sheet.crop((i * CELL, 0, (i + 1) * CELL, CELL))
            cell.save(OUT / f"{name}-{i:02d}.png", optimize=True)
        print(f"{name}: {frames} frames")


if __name__ == "__main__":
    main()
