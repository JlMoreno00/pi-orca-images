"""Render docs/banner.png. Run: python3 scripts/banner.py (needs Pillow, Inter and JetBrains Mono)."""

import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 2  # render at 2x for crisp text on HiDPI screens
W, H = 1280 * S, 400 * S
FONTS = Path.home() / "Library/Fonts"
OUT = Path(__file__).resolve().parent.parent / "docs" / "banner.png"

BG = (11, 13, 18)
FG = (232, 234, 240)
MUTED = (139, 146, 163)
ACCENT = (138, 180, 248)
PINK = (236, 72, 153)
BORDER = (40, 45, 58)


def font(name: str, size: int, weight: int | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONTS / name), size * S)
    if weight is not None:
        try:
            f.set_variation_by_axes([14, weight])
        except Exception:
            pass
    return f


def px(v: float) -> int:
    return int(v * S)


def gradient(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h))
    p = img.load()
    for y in range(h):
        for x in range(w):
            p[x, y] = (round(255 * x / (w - 1)), round(255 * y / (h - 1)), 200)
    return img


def main() -> None:
    inter_bold = font("Inter-VariableFont_opsz,wght.ttf", 64, 760)
    inter = font("Inter-VariableFont_opsz,wght.ttf", 24, 420)
    inter_small = font("Inter-VariableFont_opsz,wght.ttf", 17, 520)
    mono = font("JetBrainsMonoNerdFont-Regular.ttf", 17)
    mono_bold = font("JetBrainsMonoNerdFont-Bold.ttf", 17)

    img = Image.new("RGB", (W, H), BG)

    # Soft glow behind the terminal.
    glow = Image.new("RGB", (W, H), BG)
    g = ImageDraw.Draw(glow)
    g.ellipse((px(760), px(10), px(1260), px(400)), fill=(60, 40, 110))
    g.ellipse((px(880), px(120), px(1300), px(460)), fill=(20, 80, 110))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(px(90))), 0.55)
    d = ImageDraw.Draw(img)

    # Dot grid.
    for y in range(px(20), H, px(28)):
        for x in range(px(20), W, px(28)):
            d.ellipse((x, y, x + S, y + S), fill=(28, 32, 42))

    # Left: title block.
    x0 = px(72)
    d.text((x0, px(96)), "pi-orca-images", font=inter_bold, fill=FG)
    d.text((x0, px(188)), "Inline images for the Pi coding agent", font=inter, fill=MUTED)
    d.text((x0, px(222)), "inside Orca's terminal.", font=inter, fill=MUTED)
    chips = ["Kitty graphics", "Tab-switch recovery", "[Image N] paste labels"]
    cx = x0
    for chip in chips:
        tw = d.textlength(chip, font=inter_small)
        d.rounded_rectangle((cx, px(282), cx + tw + px(28), px(316)), radius=px(17), outline=BORDER, width=S, fill=(18, 21, 29))
        d.text((cx + px(14), px(289)), chip, font=inter_small, fill=FG)
        cx += tw + px(40)

    # Right: terminal window.
    tx0, ty0, tx1, ty1 = px(760), px(52), px(1216), px(348)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((tx0, ty0 + px(10), tx1, ty1 + px(10)), radius=px(14), fill=(0, 0, 0, 160))
    img.paste(shadow.filter(ImageFilter.GaussianBlur(px(16))), (0, 0), shadow.filter(ImageFilter.GaussianBlur(px(16))))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((tx0, ty0, tx1, ty1), radius=px(14), fill=(16, 18, 24), outline=BORDER, width=S)
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse((tx0 + px(18 + i * 20), ty0 + px(16), tx0 + px(30 + i * 20), ty0 + px(28)), fill=c)
    d.text((tx0 + px(190), ty0 + px(12)), "Orca · pi", font=inter_small, fill=MUTED)
    d.line((tx0, ty0 + px(42), tx1, ty0 + px(42)), fill=BORDER, width=S)

    lx = tx0 + px(24)
    d.text((lx, ty0 + px(58)), "read", font=mono_bold, fill=(229, 192, 123))
    d.text((lx + d.textlength("read ", font=mono_bold), ty0 + px(58)), "screenshot.png", font=mono, fill=PINK)
    img.paste(gradient(px(196), px(108)), (lx, ty0 + px(90)))
    d.text((lx, ty0 + px(214)), "Looks like a color gradient.", font=mono, fill=MUTED)

    # Prompt box with a styled label.
    by0 = ty0 + px(244)
    d.rounded_rectangle((lx - px(8), by0, tx1 - px(18), by0 + px(36)), radius=px(6), outline=BORDER, width=S)
    t = "› compare it with "
    d.text((lx, by0 + px(8)), t, font=mono, fill=FG)
    label_x = lx + d.textlength(t, font=mono)
    d.text((label_x, by0 + px(8)), "[Image 1]", font=mono_bold, fill=ACCENT)
    d.rectangle((label_x + d.textlength("[Image 1] ", font=mono_bold), by0 + px(8), label_x + d.textlength("[Image 1] ", font=mono_bold) + px(9), by0 + px(28)), fill=FG)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(OUT, img.size, os.path.getsize(OUT) // 1024, "KiB")


if __name__ == "__main__":
    sys.exit(main())
