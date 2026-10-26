"""Iconic Elevation graphic overlays, rendered as full-canvas RGBA PNGs (1080x1920) with PIL.

Every element mirrors something observed on @iconic_elevation (see references/style-bible.md, pillar 4):
  gradient   - bottom-up black gradient behind hook headline / captions
  card       - dark frosted rounded card, 1px hairline border, Anton kicker + title, optional line icon
  pill       - two-tone callout: WORD (white on #1A1A1A) + WORD (ink on lime)
  checklist  - frosted card with x / check rows, revealed one row at a time
  rulecard   - full-screen black card with dark-green radial glow and a giant lime number
  cta        - 'FOLLOW.' black end card, or DM/COMMENT keyword card with chat icon
  recframe   - REC viewfinder corners + red dot (the "nobody films this" look)
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "assets", "fonts")
ANTON = os.path.join(FONT_DIR, "Anton-Regular.ttf")
INTER_SB = os.path.join(FONT_DIR, "Inter-SemiBold.otf")
INTER_B = os.path.join(FONT_DIR, "Inter-Bold.otf")
# PIL size -> cap height ratios (capHeight / unitsPerEm)
CAP = {ANTON: 1760 / 2048, INTER_SB: 1490 / 2048, INTER_B: 1490 / 2048}


def hex_rgb(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Palette:
    def __init__(self, p):
        self.white = hex_rgb(p["white"])
        self.lime = hex_rgb(p["lime"])
        self.red = hex_rgb(p["red"])
        self.glow = hex_rgb(p["lime_glow_bg"])
        self.card = hex_rgb(p["card_bg"], int(255 * p["card_bg_alpha"]))
        self.border = hex_rgb(p["card_border"], int(255 * p["card_border_alpha"]))
        self.pill_dark = hex_rgb(p["pill_dark"])
        self.ink = hex_rgb(p["ink"])


def font(path, cap_px):
    return ImageFont.truetype(path, max(8, round(cap_px / CAP[path])))


def _text_box(draw, text, f):
    l, t, r, b = draw.textbbox((0, 0), text, font=f, anchor="ls")
    return r - l, -t  # width, cap-ish height above baseline


def blank():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def gradient(alpha_max=0.82, from_y=0.5):
    y0 = int(H * from_y)
    col = Image.new("L", (1, H), 0)
    for y in range(y0, H):
        col.putpixel((0, y), int(255 * alpha_max * ((y - y0) / (H - y0)) ** 1.3))
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.putalpha(col.resize((W, H)))
    return img


# ---------- line icons (lime, 6px strokes, drawn in a size x size box) ----------
def _icon(draw, kind, x, y, s, col, red):
    w = max(4, s // 11)
    if kind == "chat":
        draw.rounded_rectangle([x, y, x + s, y + s * 0.78], radius=s * 0.22, outline=col, width=w)
        draw.polygon([(x + s * 0.22, y + s * 0.74), (x + s * 0.18, y + s), (x + s * 0.45, y + s * 0.76)], fill=col)
        for i in range(3):
            cx = x + s * (0.3 + 0.2 * i)
            draw.ellipse([cx - w * 0.8, y + s * 0.39 - w * 0.8, cx + w * 0.8, y + s * 0.39 + w * 0.8], fill=col)
    elif kind == "check":
        draw.line([(x + s * 0.12, y + s * 0.55), (x + s * 0.4, y + s * 0.82), (x + s * 0.9, y + s * 0.2)], fill=col, width=w + 2, joint="curve")
    elif kind == "x":
        draw.line([(x + s * 0.18, y + s * 0.18), (x + s * 0.82, y + s * 0.82)], fill=red, width=w + 2)
        draw.line([(x + s * 0.82, y + s * 0.18), (x + s * 0.18, y + s * 0.82)], fill=red, width=w + 2)
    elif kind == "bolt":
        draw.polygon([(x + s * 0.58, y), (x + s * 0.15, y + s * 0.58), (x + s * 0.48, y + s * 0.58),
                      (x + s * 0.38, y + s), (x + s * 0.85, y + s * 0.4), (x + s * 0.52, y + s * 0.4)], outline=col, width=w)
    elif kind == "trend":
        pts = [(x, y + s * 0.85), (x + s * 0.35, y + s * 0.5), (x + s * 0.6, y + s * 0.68), (x + s, y + s * 0.12)]
        draw.line(pts, fill=col, width=w, joint="curve")
        draw.polygon([(x + s, y + s * 0.05), (x + s * 0.72, y + s * 0.12), (x + s * 0.95, y + s * 0.35)], fill=col)
    elif kind == "clock":
        draw.ellipse([x, y, x + s, y + s], outline=col, width=w)
        draw.line([(x + s / 2, y + s / 2), (x + s / 2, y + s * 0.2)], fill=col, width=w)
        draw.line([(x + s / 2, y + s / 2), (x + s * 0.72, y + s * 0.62)], fill=col, width=w)
    elif kind == "people":
        for cx in (0.33, 0.67):
            draw.ellipse([x + s * (cx - 0.13), y + s * 0.1, x + s * (cx + 0.13), y + s * 0.36], outline=col, width=w)
            draw.arc([x + s * (cx - 0.25), y + s * 0.45, x + s * (cx + 0.25), y + s * 1.05], 180, 360, fill=col, width=w)
    elif kind == "arrow":
        for i in range(5):  # dotted down arrow (hook headline connector)
            cy = y + i * s * 0.16
            draw.ellipse([x + s / 2 - w * 0.6, cy - w * 0.6, x + s / 2 + w * 0.6, cy + w * 0.6], fill=col)
        draw.polygon([(x + s * 0.25, y + s * 0.78), (x + s * 0.75, y + s * 0.78), (x + s / 2, y + s)], fill=col)


def _frosted(img, box, pal, radius=28):
    """Dark translucent rounded card + hairline border. (Backdrop blur is approximated by opacity.)"""
    layer = blank()
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=radius, fill=pal.card, outline=pal.border, width=2)
    sh = blank()
    ImageDraw.Draw(sh).rounded_rectangle([box[0], box[1] + 10, box[2], box[3] + 10], radius=radius, fill=(0, 0, 0, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(sh)
    img.alpha_composite(layer)


def card(pal, kicker="", title="", accent="lime", position="top", icon=None, strike=False):
    img = blank()
    d = ImageDraw.Draw(img)
    fk, ft = font(ANTON, 30), font(ANTON, 64)
    kw, _ = _text_box(d, kicker.upper(), fk) if kicker else (0, 0)
    tw, _ = _text_box(d, title.upper(), ft) if title else (0, 0)
    pad, isz = 40, 70 if icon else 0
    gap = 28 if icon else 0
    inner = max(kw, tw)
    cw = inner + pad * 2 + isz + gap
    ch = pad * 2 + (30 + 22 if kicker else 0) + 64
    if position == "upper-right":
        x0, y0 = W - 64 - cw, int(H * 0.26)
    elif position in ("center", "chest"):
        x0, y0 = (W - cw) // 2, int(H * 0.44) - ch // 2
    else:  # top
        x0, y0 = (W - cw) // 2, int(H * 0.075)
    _frosted(img, [x0, y0, x0 + cw, y0 + ch], pal)
    tx = x0 + pad + isz + gap
    if icon:
        _icon(d, icon, x0 + pad, y0 + (ch - isz) // 2, isz, pal.lime, pal.red)
    y = y0 + pad
    if kicker:
        d.text((tx, y + 30), kicker.upper(), font=fk, fill=pal.white, anchor="ls")
        y += 30 + 22
    col = {"lime": pal.lime, "white": pal.white, "red": pal.red}[accent]
    d.text((tx, y + 64), title.upper(), font=ft, fill=col, anchor="ls")
    if strike:
        d.line([(tx - 6, y + 32), (tx + tw + 6, y + 32)], fill=pal.red, width=9)
    return img


def pill(pal, left, right, center_y=1110):
    img = blank()
    d = ImageDraw.Draw(img)
    f = font(ANTON, 62)
    lw, _ = _text_box(d, left.upper(), f)
    rw, _ = _text_box(d, right.upper(), f)
    px, py, gap = 34, 26, 18
    h = 62 + py * 2
    total = lw + rw + px * 4 + gap
    x = (W - total) // 2
    y = center_y - h // 2
    for (txt, tw, bg, fg) in ((left, lw, pal.pill_dark, pal.white), (right, rw, pal.lime, pal.ink)):
        sh = blank()
        ImageDraw.Draw(sh).rounded_rectangle([x, y + 8, x + tw + px * 2, y + h + 8], radius=22, fill=(0, 0, 0, 110))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
        d.rounded_rectangle([x, y, x + tw + px * 2, y + h], radius=22, fill=bg)
        d.text((x + px, y + py + 62), txt.upper(), font=f, fill=fg, anchor="ls")
        x += tw + px * 2 + gap
    return img


def checklist(pal, title, items, upto=None):
    """items: list of (text, 'x'|'check'). upto: number of rows revealed (for staggered pops)."""
    upto = len(items) if upto is None else upto
    img = blank()
    d = ImageDraw.Draw(img)
    fk, fi = font(ANTON, 32), font(ANTON, 46)
    widths = [_text_box(d, t.upper(), fi)[0] for t, _ in items] + [_text_box(d, title.upper(), fk)[0] - 64]
    cw = max(widths) + 64 + 30 + 80
    row = 46 + 34
    ch = 40 + 32 + 30 + row * len(items) + 16
    x0, y0 = (W - cw) // 2, int(H * 0.44) - ch // 2  # chest area, like the UI cards on the reels
    _frosted(img, [x0, y0, x0 + cw, y0 + ch], pal)
    d.text((x0 + 40, y0 + 40 + 32), title.upper(), font=fk, fill=pal.lime, anchor="ls")
    y = y0 + 40 + 32 + 30
    for i, (t, mark) in enumerate(items[:upto]):
        _icon(d, "check" if mark == "check" else "x", x0 + 40, y + 4, 46, pal.lime, pal.red)
        d.text((x0 + 40 + 64 + 30, y + 46), t.upper(), font=fi, fill=pal.white, anchor="ls")
        if mark == "strike":
            tw = _text_box(d, t.upper(), fi)[0]
            d.line([(x0 + 134, y + 23), (x0 + 134 + tw, y + 23)], fill=pal.red, width=7)
        y += row
    return img


def rulecard(pal, number, subtitle="", kicker=""):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    glow = blank()
    gd = ImageDraw.Draw(glow)
    r = 620
    gd.ellipse([W / 2 - r, H * 0.45 - r, W / 2 + r, H * 0.45 + r], fill=pal.glow)
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(220)))
    d = ImageDraw.Draw(img)
    fn = font(ANTON, 300)
    nw, _ = _text_box(d, number.upper(), fn)
    base = int(H * 0.52)
    if kicker:
        fk = font(ANTON, 40)
        kw, _ = _text_box(d, kicker.upper(), fk)
        d.text(((W - kw) / 2, base - 300 - 70), kicker.upper(), font=fk, fill=pal.white, anchor="ls")
    d.text(((W - nw) / 2, base), number.upper(), font=fn, fill=pal.lime, anchor="ls")
    if subtitle:
        fs = font(INTER_B, 46)
        sw, _ = _text_box(d, subtitle.upper(), fs)
        d.text(((W - sw) / 2, base + 120), subtitle.upper(), font=fs, fill=pal.white, anchor="ls")
    return img


def cta(pal, kind="follow", keyword=""):
    if kind == "follow":
        img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        d = ImageDraw.Draw(img)
        f = font(ANTON, 150)
        tw, _ = _text_box(d, "FOLLOW.", f)
        d.text(((W - tw) / 2, H / 2 + 75), "FOLLOW.", font=f, fill=pal.white, anchor="ls")
        return img
    verb = "DM ME" if kind == "dm" else "COMMENT"
    img = blank()
    d = ImageDraw.Draw(img)
    fk, ft = font(ANTON, 44), font(ANTON, 96)
    kw = "'" + keyword.upper() + "'"
    w1, _ = _text_box(d, verb, fk)
    w2, _ = _text_box(d, kw, ft)
    isz, pad = 96, 46
    cw = isz + 34 + max(w1, w2) + pad * 2
    ch = pad * 2 + 44 + 24 + 96
    x0, y0 = (W - cw) // 2, int(H * 0.4)
    _frosted(img, [x0, y0, x0 + cw, y0 + ch], pal, radius=34)
    _icon(d, "chat", x0 + pad, y0 + (ch - isz) // 2, isz, pal.lime, pal.red)
    tx = x0 + pad + isz + 34
    d.text((tx, y0 + pad + 44), verb, font=fk, fill=pal.white, anchor="ls")
    d.text((tx, y0 + pad + 44 + 24 + 96), kw, font=ft, fill=pal.lime, anchor="ls")
    return img


def recframe(pal):
    img = blank()
    d = ImageDraw.Draw(img)
    m, L, w = 70, 96, 5
    for (x, y, dx, dy) in ((m, m + 120, 1, 1), (W - m, m + 120, -1, 1), (m, H - m - 260, 1, -1), (W - m, H - m - 260, -1, -1)):
        d.line([(x, y), (x + dx * L, y)], fill=pal.white, width=w)
        d.line([(x, y), (x, y + dy * L)], fill=pal.white, width=w)
    d.ellipse([m + 30, m + 150, m + 54, m + 174], fill=pal.red)
    d.text((m + 66, m + 172), "REC", font=font(INTER_B, 24), fill=pal.white, anchor="ls")
    return img


def proof_photo_frame(pal, photo_path, center_y=880, size=560):
    """Passport/proof photo inset with lime focus brackets (DeU4OWNOUPa 00:34)."""
    img = blank()
    ph = Image.open(photo_path).convert("RGBA")
    s = size / max(ph.size)
    ph = ph.resize((int(ph.width * s), int(ph.height * s)))
    x, y = (W - ph.width) // 2, center_y - ph.height // 2
    img.alpha_composite(ph, (x, y))
    d = ImageDraw.Draw(img)
    L, w, o = 70, 7, 18
    for (cx, cy, dx, dy) in ((x - o, y - o, 1, 1), (x + ph.width + o, y - o, -1, 1),
                             (x - o, y + ph.height + o, 1, -1), (x + ph.width + o, y + ph.height + o, -1, -1)):
        d.line([(cx, cy), (cx + dx * L, cy)], fill=pal.lime, width=w)
        d.line([(cx, cy), (cx, cy + dy * L)], fill=pal.lime, width=w)
    return img


def contact_sheet(frames, cols=4, thumb_w=270):
    """Build a contact sheet from a list of PIL images (used for QA previews)."""
    if not frames:
        return None
    th = int(thumb_w * 16 / 9)
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGB", (cols * thumb_w, rows * th), (20, 20, 20))
    for i, f in enumerate(frames):
        sheet.paste(f.convert("RGB").resize((thumb_w, th)), ((i % cols) * thumb_w, (i // cols) * th))
    return sheet
