"""Cut the figures out of a reference sheet (a grid of people on a plain grey
background) into transparent WebP pictures that all share one canvas, with
the feet on the bottom edge and the body centred, so they can be swapped on
the Character stage without jumping.

    python3 tools/cutout-figures.py SHEET COLS ROWS OUT_DIR name1 name2 ...

Names go left to right, top to bottom; "-" skips a cell.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

# Colour distance from the local background: below LO is background, above HI is
# figure, in between becomes a soft edge.
LO, HI = 14.0, 34.0


def background(cell: np.ndarray) -> np.ndarray:
    """A smooth background estimate, filled in behind the figure from the grey around it.

    Starts from the border colour, then repeatedly blurs only the pixels that look
    like background, so slow shading across the sheet is followed.
    """
    h, w, _ = cell.shape
    border = np.zeros((h, w), bool)
    border[:6], border[-6:], border[:, :6], border[:, -6:] = True, True, True, True
    bg = np.broadcast_to(np.median(cell[border], axis=0), cell.shape).copy()
    for sigma in (40, 25, 15):
        m = (np.sqrt(((cell - bg) ** 2).sum(-1)) < LO * 1.5).astype(float)
        m = ndimage.binary_erosion(m, iterations=3).astype(float)
        num = np.stack([ndimage.gaussian_filter(cell[..., c] * m, sigma) for c in range(3)], -1)
        den = ndimage.gaussian_filter(m, sigma)[..., None]
        bg = np.where(den > 1e-3, num / np.maximum(den, 1e-3), bg)
    return bg


def cut(cell: np.ndarray):
    bg = background(cell)
    dist = np.sqrt(((cell - bg) ** 2).sum(-1))
    fg = dist > LO
    # Background is whatever near-background region touches the cell edge, plus any
    # large enclosed pocket of it (the gap between an arm and the body).
    regions, n = ndimage.label(~fg)
    keep_bg = np.zeros(n + 1, bool)
    edge = np.unique(np.r_[regions[0], regions[-1], regions[:, 0], regions[:, -1]])
    keep_bg[edge] = True
    sizes = ndimage.sum(np.ones_like(regions), regions, range(n + 1))
    keep_bg[sizes > 150] = True
    keep_bg[0] = False
    solid = ~keep_bg[regions]
    # The figure is the biggest blob; small blobs near it (flames, fingers) stay, the caption goes.
    blobs, m = ndimage.label(solid)
    if m == 0:
        return None
    areas = ndimage.sum(solid, blobs, range(1, m + 1))
    main = int(np.argmax(areas)) + 1
    ys, xs = np.nonzero(blobs == main)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    mask = np.zeros_like(solid)
    for i, box in enumerate(ndimage.find_objects(blobs), start=1):
        if areas[i - 1] < 25:
            continue
        if box[0].stop <= bottom + 4 and box[1].start >= left - 40 and box[1].stop <= right + 40:
            mask |= blobs == i
    # The floor shadow round the feet is a slightly darker, colourless grey; drop it
    # (black boots are far darker, white sneakers are lighter than the floor).
    yy = np.arange(mask.shape[0])[:, None]
    lum, bg_lum = cell.mean(-1), bg.mean(-1)
    chroma = cell.max(-1) - cell.min(-1)
    ratio = lum / np.maximum(bg_lum, 1)
    shadow = (yy > bottom - 0.08 * (bottom - top)) & (chroma < 14) & (ratio > 0.5) & (ratio < 0.97)
    mask &= ~ndimage.binary_opening(shadow, iterations=1)
    alpha = np.clip((dist - LO) / (HI - LO), 0, 1)
    alpha = np.where(mask, np.maximum(alpha, ndimage.binary_erosion(mask, iterations=2)), 0.0)
    alpha = ndimage.gaussian_filter(alpha, 0.6) * mask
    # Remove the grey the soft edge picked up: colour = a*figure + (1-a)*background.
    a = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.clip((cell - (1 - a) * bg) / a, 0, 255)
    ys, xs = np.nonzero(alpha > 0.05)
    lower = ys > ys.min() + 0.6 * (ys.max() - ys.min())
    return rgb, alpha, ys.min(), ys.max(), float(xs[lower].mean())


def main():
    sheet, cols, rows, out_dir, *names = sys.argv[1:]
    cols, rows = int(cols), int(rows)
    img = np.asarray(Image.open(sheet).convert('RGB'), dtype=np.float64)
    h, w, _ = img.shape
    cw, ch = w // cols, h // rows
    cuts = {}
    for i, name in enumerate(names):
        if name == '-':
            continue
        r, c = divmod(i, cols)
        got = cut(img[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw])
        if got:
            cuts[name] = got
    # One canvas for the whole set: tallest figure plus headroom, widest half-width.
    tall = max(b - t for _, _, t, b, _ in cuts.values())
    half = max(max(cx, cw - cx) for *_, cx in cuts.values())
    W, H = int(np.ceil(half * 2)) + 8, tall + 24
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for name, (rgb, alpha, top, bottom, cx) in cuts.items():
        canvas = np.zeros((H, W, 4))
        dy = H - 2 - bottom
        dx = int(round(W / 2 - cx))
        y0, x0 = max(0, -dy), max(0, -dx)
        y1, x1 = min(rgb.shape[0], H - dy), min(rgb.shape[1], W - dx)
        canvas[y0 + dy:y1 + dy, x0 + dx:x1 + dx, :3] = rgb[y0:y1, x0:x1]
        canvas[y0 + dy:y1 + dy, x0 + dx:x1 + dx, 3] = alpha[y0:y1, x0:x1] * 255
        out = Image.fromarray(canvas.round().astype(np.uint8), 'RGBA')
        out.save(Path(out_dir) / f'{name}.webp', quality=90, method=6)
        print(f'{name}: {W}x{H}')


if __name__ == '__main__':
    main()
