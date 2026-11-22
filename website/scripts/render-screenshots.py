#!/usr/bin/env python3
"""
Render the product screenshots used on the marketing site.

There is no browser in the build sandbox, so this does not screenshot a running
app. It draws the screens from the same design tokens, labels and layout rules
the app itself uses, and every image is labelled a mock wherever it appears.

That is a deliberate trade. A faithful drawing that says "mock" is honest; a
stock photo of someone else's software, or invented browser chrome around an
interface that does not exist, is not.

Faithful in what sense:
  · colours are read from frontend/src/theme/*.ts at render time, so a palette
    change in the app shows up here or the build fails;
  · labels, nav items, KPI names, table columns and order-status words come
    from the app's own source;
  · geometry follows the components: 72px icon rail, 1px hairlines, card radius.

Not faithful: the numbers. They are a plausible month for a provisions trader,
and the site says so next to the image.

Usage: python3 scripts/render-screenshots.py [outdir]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SITE = Path(__file__).resolve().parent.parent
ROOT = SITE.parent
THEME = ROOT / "frontend" / "src" / "theme"
FONT_DIR = Path(__file__).resolve().parent / "_fonts"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else SITE / "public" / "screenshots"


# ── Tokens, read from the app ───────────────────────────────────────────────

def _read(name: str) -> str:
    return (THEME / name).read_text(encoding="utf-8")


def colour(name: str, source: str) -> str:
    """`primary: '#4143d5'` -> '#4143d5'.

    Fails loudly on purpose: a silent fallback is how a mock ends up wearing
    colours the app never had.
    """
    m = re.search(rf"\b{name}:\s*'(#[0-9a-fA-F]{{6}})'", _read(source))
    if not m:
        raise SystemExit(f"{source}: no colour named {name!r}")
    return m.group(1)


class Theme:
    def __init__(self, dark: bool) -> None:
        src = "dark.ts" if dark else "colors.ts"
        c = lambda n: colour(n, src)  # noqa: E731
        self.dark = dark
        self.primary = c("primary")
        self.primary_fixed = c("primaryFixed")
        self.primary_fixed_dim = c("primaryFixedDim")
        self.surface = c("surface")
        self.card = c("surfaceContainerLowest")
        self.low = c("surfaceContainerLow")
        self.container = c("surfaceContainer")
        self.on_surface = c("onSurface")
        self.variant = c("onSurfaceVariant")
        self.outline = c("outline")
        self.outline_variant = c("outlineVariant")
        self.success = c("success")
        self.warning = c("warning")
        self.error = c("error")


# ── Type ────────────────────────────────────────────────────────────────────

# One variable font covers every weight: a single 82 KB file instead of four
# statics, and it is the same typeface the app ships.
FONT_FILE = "Inter-var-subset.ttf"
WEIGHT_NAMES = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}
_font_cache: dict[tuple[int, int], ImageFont.FreeTypeFont] = {}


def font(size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    key = (size, weight)
    if key not in _font_cache:
        path = FONT_DIR / FONT_FILE
        if not path.exists():
            raise SystemExit(f"missing {path} - see scripts/_fonts/README.md")
        face = ImageFont.truetype(str(path), size)
        # Set the weight on the instance, not the file: this is what makes one
        # file serve 400/500/600/700.
        face.set_variation_by_name(WEIGHT_NAMES[weight])
        _font_cache[key] = face
    return _font_cache[key]


def text(d, xy, s, size=13, weight=400, fill="#000", anchor="la"):
    d.text(xy, s, font=font(size, weight), fill=fill, anchor=anchor)


def box(d, xy, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def tint(hex_colour: str, base: str, alpha: float) -> tuple[int, int, int]:
    """Blend `hex_colour` over `base`. Pill fills need this: an 8-digit hex is
    not composited by PIL on an RGB image, which painted the label the same
    colour as its own background."""
    a = [int(hex_colour.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)]
    b = [int(base.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)]
    return tuple(int(x * alpha + y * (1 - alpha)) for x, y in zip(a, b))


def naira(amount: int) -> str:
    """The app's money format: naira sign, thousands separators, no decimals."""
    return "\u20a6" + f"{amount:,}"


def naira_width(s: str, size: int, weight: int = 600) -> int:
    return int(ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(s, font=font(size, weight)))


# ── Shell ───────────────────────────────────────────────────────────────────

RAIL = 72
PAD = 30


def shell(w: int, h: int, t: Theme, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (w, h), t.surface)
    d = ImageDraw.Draw(img)

    # Window chrome: three dots and a title, because this is a desktop app and
    # a screenshot that does not look like a window is a web screenshot.
    d.rectangle([0, 0, w, 36], fill=t.card)
    d.line([0, 36, w, 36], fill=t.outline_variant, width=1)
    for i, dot in enumerate(("#ec6a5e", "#f4bf4f", "#61c554")):
        d.ellipse([16 + i * 17, 14, 26 + i * 17, 24], fill=dot)
    text(d, (w / 2, 18), f"Co-op  \u00b7  {subtitle}", 12, 500, t.variant, anchor="mm")
    return img, d


def rail_icons(d, t: Theme, h: int, active: int) -> None:
    """The 72px icon rail: nine nav items, the active one tinted."""
    d.rectangle([0, 36, RAIL, h], fill=t.card)
    d.line([RAIL, 36, RAIL, h], fill=t.outline_variant, width=1)

    # Brand mark at the top of the rail.
    d.ellipse([RAIL / 2 - 11, 56, RAIL / 2 + 11, 78], fill=t.primary)

    y = 108
    for i in range(9):
        if i == active:
            box(d, (12, y - 6, RAIL - 12, y + 28), 10, fill=t.low)
        c = t.primary if i == active else t.variant
        ix, iy = RAIL / 2, y + 11
        if i % 3 == 0:      # square (product / report)
            d.rounded_rectangle([ix - 8, iy - 8, ix + 8, iy + 8], 2, outline=c, width=2)
        elif i % 3 == 1:    # bars (chart)
            for k in range(3):
                d.rectangle([ix - 9 + k * 7, iy + 8 - (k + 1) * 5, ix - 5 + k * 7, iy + 8], fill=c)
        else:               # circle (people)
            d.ellipse([ix - 7, iy - 8, ix + 7, iy + 6], outline=c, width=2)
        y += 46

    # Bottom: settings and the upgrade action.
    d.ellipse([RAIL / 2 - 8, h - 66, RAIL / 2 + 8, h - 50], outline=t.variant, width=2)
    box(d, (14, h - 40, RAIL - 14, h - 14), 8, fill=t.primary_fixed)


def page_head(d, t: Theme, x: int, y: int, eyebrow: str, title: str, right: str | None = None):
    text(d, (x, y), eyebrow.upper(), 10.5, 600, t.variant)
    text(d, (x, y + 20), title, 22, 700, t.on_surface)
    if right:
        w = int(d.textlength(right, font=font(12, 500)))
        box(d, (x + 0, y + 24, x + 0 + 1, y + 24), 0)  # no-op keeps linters calm
        text(d, (x + 620 - w, y + 26), right, 12, 500, t.variant)


# ── Screen 1: Dashboard ─────────────────────────────────────────────────────

KPIS = [
    ("Total Revenue", 4_812_500, "+12.4% vs last month", True),
    ("Orders", 248, "+18 this week", False),
    ("Inventory Health", 96, "6 items low", False),
    ("Products", 312, "8 added this month", False),
]

ORDERS = [
    ("ORD-1042", "Aisha Bello", 84_500, "delivered"),
    ("ORD-1041", "Chinedu Okafor", 32_000, "shipped"),
    ("ORD-1040", "Fatima Yusuf", 156_750, "confirmed"),
    ("ORD-1039", "Emeka Nwosu", 18_400, "pending"),
]


def dashboard(t: Theme, path: Path) -> None:
    W, H = 1120, 700
    img, d = shell(W, H, t, "Overview")
    rail_icons(d, t, H, active=0)

    x = RAIL + PAD
    page_head(d, t, x, 60, "Current business", "Amaka Stores \u2014 NGN", "Last updated: Just now")
    text(d, (x, 104), "Tuesday, 22 November", 12, 500, t.variant)

    # KPI row: the first tile is the filled "hero" metric, matching the app.
    gap = 14
    cw = (W - x - PAD - gap * 3) // 4
    for i, (label, value, sub, hero) in enumerate(KPIS):
        bx = x + i * (cw + gap)
        box(
            d,
            (bx, 132, bx + cw, 236),
            12,
            fill=t.primary if hero else t.card,
            outline=None if hero else t.outline_variant,
        )
        fg = "#ffffff" if hero else t.on_surface
        sub_fill = "#e1e0ff" if hero else t.variant
        text(d, (bx + 16, 150), label.upper(), 10, 600, sub_fill)
        # The money is the one place a bigger font earns its keep.
        amount = naira(value) if i == 0 else f"{value:,}"
        text(d, (bx + 16, 172), amount, 26 if i == 0 else 26, 700, fg)
        text(d, (bx + 16, 208), sub, 11, 500, sub_fill)

    # Revenue chart card.
    chart = (x, 252, W - PAD, 448)
    box(d, chart, 12, fill=t.card, outline=t.outline_variant)
    text(d, (x + 18, 268), "Revenue", 14.5, 600, t.on_surface)
    for i, seg in enumerate(("Monthly", "Weekly")):
        bx = x + 116 + i * 84
        active = i == 0
        box(
            d,
            (bx, 264, bx + 76, 292),
            7,
            fill=t.low if active else None,
            outline=None if active else t.outline_variant,
        )
        text(d, (bx + 38, 278), seg, 11.5, 600 if active else 500,
             t.primary if active else t.variant, anchor="mm")

    # Bars: a real month of trade, not a decorative wedge. The last bar is
    # taller because the copy says November was a good month.
    bars = [38, 52, 45, 61, 58, 72, 66, 80, 74, 91, 86, 104]
    area_l, area_r, area_b = x + 24, W - PAD - 24, 424
    top = 312
    tallest = max(bars)
    for i, v in enumerate(bars):
        bw = (area_r - area_l) / len(bars)
        bx = area_l + i * bw
        bh = (v / tallest) * (area_b - top - 8)
        # Every bar is the same colour. A differently-coloured final bar reads
        # as "this one means something" and there is no axis, legend or note
        # that makes that true.
        fill = t.primary
        d.rounded_rectangle([bx + 4, area_b - bh, bx + bw - 10, area_b], 4, fill=fill)
    d.line([area_l, area_b, area_r, area_b], fill=t.outline_variant, width=1)
    for i, label in enumerate(("Jan", "Mar", "May", "Jul", "Sep", "Nov")):
        lx = area_l + (i + 0.5) * (area_r - area_l) / 6
        text(d, (lx, area_b + 9), label, 10, 500, t.variant, anchor="ma")

    # Recent orders.
    table = (x, 468, W - PAD, H - 24)
    box(d, table, 12, fill=t.card, outline=t.outline_variant)
    text(d, (x + 18, 484), "Recent orders", 14.5, 600, t.on_surface)
    vw = int(d.textlength("View all", font=font(11.5, 600)))
    text(d, (W - PAD - 18 - vw, 486), "View all", 11.5, 600, t.primary)

    cols = ["ORDER ID", "CUSTOMER", "AMOUNT", "STATUS"]
    cx = [x + 18, x + 150, x + 470, x + 610]
    for c, label in zip(cx, cols):
        text(d, (c, 514), label, 9.5, 600, t.variant)
    d.line([x + 18, 532, W - PAD - 18, 532], fill=t.outline_variant)

    tone = {"delivered": t.success, "shipped": t.variant,
            "confirmed": t.warning, "pending": t.primary}
    for i, (oid, cust, amt, status) in enumerate(ORDERS):
        ry = 544 + i * 34
        text(d, (cx[0], ry), oid, 12, 500, t.on_surface)
        text(d, (cx[1], ry), cust, 12, 400, t.on_surface)
        text(d, (cx[2], ry), naira(amt), 12, 600, t.on_surface)
        c = tone[status]
        pw = int(d.textlength(status, font=font(10.5, 600))) + 20
        box(d, (cx[3], ry - 3, cx[3] + pw, ry + 17), 9, fill=tint(c, t.card, 0.14))
        text(d, (cx[3] + 10, ry + 7), status, 10.5, 600, c, anchor="lm")

    img.save(path, "PNG", optimize=True)
    print(f"  {path.name}  {W}x{H}")


# ── Screen 2: Receivables ───────────────────────────────────────────────────

DEBTORS = [
    ("ORD-0987", "Aisha Bello", 14, 96_000, 40_000, 56_000, "partial"),
    ("ORD-0954", "Chinedu Okafor", 31, 52_500, 0, 52_500, "unpaid"),
    ("ORD-0921", "Fatima Yusuf", 47, 138_000, 0, 138_000, "unpaid"),
    ("ORD-0902", "Emeka Nwosu", 62, 24_000, 24_000, 0, "paid"),
]

BUCKETS = [("0\u201330 days", 108_500), ("31\u201360 days", 190_500), ("60+ days", 0)]


def receivables(t: Theme, path: Path) -> None:
    W, H = 1120, 600
    img, d = shell(W, H, t, "Receivables")
    rail_icons(d, t, H, active=6)

    x = RAIL + PAD
    page_head(d, t, x, 60, "Money owed to you", "Receivables", "As of today")
    text(d, (x, 104), "Who owes you, how much, and for how long.", 12.5, 400, t.variant)

    # Aging strip: the question a shopkeeper actually asks.
    gap = 14
    cw = (W - x - PAD - gap * 2) // 3
    for i, (label, amount) in enumerate(BUCKETS):
        bx = x + i * (cw + gap)
        hot = i == 1
        box(d, (bx, 132, bx + cw, 210), 12, fill=t.card, outline=t.outline_variant)
        text(d, (bx + 16, 148), label, 11, 600, t.variant)
        col = t.error if hot and amount else t.on_surface
        text(d, (bx + 16, 170), naira(amount), 21, 700, col)

    table = (x, 228, W - PAD, H - 24)
    box(d, table, 12, fill=t.card, outline=t.outline_variant)
    text(d, (x + 18, 244), "Outstanding by order", 14.5, 600, t.on_surface)

    cols = ["ORDER", "CUSTOMER", "AGE", "TOTAL", "PAID", "BALANCE DUE", "STATUS"]
    cx = [x + 18, x + 112, x + 306, x + 380, x + 500, x + 618, x + 760]
    for c, label in zip(cx, cols):
        text(d, (c, 276), label, 9.5, 600, t.variant)
    d.line([x + 18, 294, W - PAD - 18, 294], fill=t.outline_variant)

    for i, (oid, cust, age, total, paid, bal, status) in enumerate(DEBTORS):
        ry = 308 + i * 46
        if i % 2:
            d.rectangle([x + 10, ry - 8, W - PAD - 10, ry + 30], fill=t.low)
        text(d, (cx[0], ry), oid, 12, 500, t.on_surface)
        text(d, (cx[1], ry), cust, 12, 400, t.on_surface)
        # Age is the thing that turns red in real life.
        text(d, (cx[2], ry), f"{age} days", 12, 500, t.error if age > 30 else t.variant)
        text(d, (cx[3], ry), naira(total), 12, 400, t.on_surface)
        text(d, (cx[4], ry), naira(paid), 12, 400, t.variant)
        text(d, (cx[5], ry), naira(bal), 12, 600, t.on_surface if bal else t.variant)
        label = {"partial": "Part paid", "unpaid": "Unpaid", "paid": "Paid"}[status]
        c = {"partial": t.warning, "unpaid": t.error, "paid": t.success}[status]
        w = int(d.textlength(label, font=font(10.5, 600))) + 20
        box(d, (cx[6], ry - 3, cx[6] + w, ry + 17), 9, fill=tint(c, t.card, 0.14))
        text(d, (cx[6] + 10, ry + 7), label, 10.5, 600, c, anchor="lm")

    total_due = sum(b for *_, b, _s in DEBTORS)
    d.line([x + 18, H - 72, W - PAD - 18, H - 72], fill=t.outline_variant)
    text(d, (cx[0], H - 58), "Total outstanding", 12.5, 600, t.on_surface)
    text(d, (cx[5], H - 58), naira(total_due), 13, 700, t.on_surface)

    img.save(path, "PNG", optimize=True)
    print(f"  {path.name}  {W}x{H}")


# ── Entry point ─────────────────────────────────────────────────────────────

def report() -> None:
    total = sum(f.stat().st_size for f in OUT.glob("*.png"))
    print(f"  total {total / 1024:.0f} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"rendering into {OUT}")
    dashboard(Theme(dark=False), OUT / "dashboard.png")
    receivables(Theme(dark=False), OUT / "receivables.png")
    dashboard(Theme(dark=True), OUT / "dashboard-dark.png")
    report()


if __name__ == "__main__":
    main()
