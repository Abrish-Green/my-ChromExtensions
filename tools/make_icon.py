#!/usr/bin/env python3
"""Generate the My Toolbox toolbar icons (original design).

A white clock face on a navy rounded tile with a green countdown ring.

Usage:
    pip install pillow
    python3 tools/make_icon.py my-toolbox/icons
"""
import math
import os
import sys

from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else "my-toolbox/icons"
os.makedirs(out, exist_ok=True)

S = 1024  # draw large, then downsample for smooth edges
NAVY = (31, 58, 138, 255)
GREEN = (46, 158, 91, 255)
WHITE = (255, 255, 255, 255)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
c = S // 2

# Rounded navy tile
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=230, fill=NAVY)

# White clock face
r = 330
d.ellipse([c - r, c - r, c + r, c + r], fill=WHITE)

# Green countdown ring (about two thirds elapsed)
ring_r = r + 60
d.arc([c - ring_r, c - ring_r, c + ring_r, c + ring_r], start=-90, end=150, fill=GREEN, width=56)
for ang in (-90, 150):  # round caps on the arc ends
    x = c + ring_r * math.cos(math.radians(ang))
    y = c + ring_r * math.sin(math.radians(ang))
    d.ellipse([x - 28, y - 28, x + 28, y + 28], fill=GREEN)


def hand(x2, y2, width):
    d.line([c, c, x2, y2], fill=NAVY, width=width)
    d.ellipse([x2 - width // 2, y2 - width // 2, x2 + width // 2, y2 + width // 2], fill=NAVY)


hand(c, c - 210, 56)          # minute hand
hand(c + 130, c + 75, 56)     # hour hand
d.ellipse([c - 44, c - 44, c + 44, c + 44], fill=NAVY)  # center cap

for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, f"icon{size}.png"))
print(f"icons written to {out}")
