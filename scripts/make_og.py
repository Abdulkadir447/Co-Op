"""Render website/public/og.png — the 1200x630 WhatsApp/OG preview card.

Drawn rather than generated: text has to be exactly right, and an AI image
would either garble the product name or invent a screenshot of software that
does not exist. This uses the same tokens as the site (primary #4143d5,
surface #fcf8ff) so the card cannot drift from the brand.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]

W, H = 1200, 630
PRIMARY = (65, 67, 213)
SURFACE = (252, 248, 255)
INK = (26, 27, 38)
MUTED = (95, 94, 110)

# A font that ships with DejaVu (present on Linux/CI); fall back gracefully.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

def load(size, bold=True):
    prefer = FONT_CANDIDATES[0] if bold else FONT_CANDIDATES[1]
    for path in ([prefer] + FONT_CANDIDATES):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

img = Image.new("RGB", (W, H), SURFACE)
d = ImageDraw.Draw(img)

# Left colour band: the brand indigo, so the card is recognisable at 200px.
d.rectangle([0, 0, 28, H], fill=PRIMARY)

# The Co-op mark: three rounded bars, the app's own equalizer motif.
# Drawn above the wordmark, not behind it — an overlapping mark reads as a
# rendering bug at thumbnail size, which is the only size that matters here.
for x, h in ((96, 80), (146, 112), (196, 144)):
    d.rounded_rectangle([x, 250 - h, x + 34, 250], radius=17, fill=PRIMARY)

# Wordmark.
d.text((92, 250), "Co-op", font=load(96), fill=INK)

# Tagline — one sentence, the same claim the page makes.
d.text((100, 392), "Inventory, orders, customers", font=load(36, False), fill=MUTED)
d.text((100, 440), "and invoicing in one calm", font=load(36, False), fill=MUTED)
d.text((100, 488), "desktop app for Nigerian retail.", font=load(36, False), fill=MUTED)

# A quiet footnote: what the product is, in the space the card leaves.
d.text((100, 556), "Windows desktop  ·  Built for Nigerian retail", font=load(24, False),
       fill=(140, 138, 156))

# Right: a quiet card silhouette, not a fake screenshot.
d.rounded_rectangle([770, 150, 1150, 480], radius=24, fill=(255, 255, 255),
                    outline=(226, 224, 236), width=2)
d.rounded_rectangle([800, 186, 1010, 206], radius=10, fill=(226, 224, 236))
d.rounded_rectangle([800, 226, 940, 242], radius=8, fill=(238, 236, 245))
for i, y in enumerate((280, 330, 380, 430)):
    w = [300, 250, 280, 220][i]
    d.rounded_rectangle([800, y, 800 + w, y + 24], radius=12,
                        fill=(238, 236, 245) if i else (214, 214, 245))

out = ROOT / "website" / "public" / "og.png"
img.save(out, optimize=True)
print(f"wrote {out.relative_to(ROOT)} {img.size[0]}x{img.size[1]}")
