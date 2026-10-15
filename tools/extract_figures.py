"""Extract project-page figures from the paper PDFs.

Usage (from repo root):
    python tools/extract_figures.py [--paper paper/WACV_3315.pdf] [--supp paper/DASH_supp.pdf]

Vector figures (Fig. 1, Fig. 2) are rasterised from the PDF at 4x (288 dpi).
Sample grids (Fig. 3, Supp. Fig. E6, E7) are rebuilt from the embedded sample
tiles exactly as stored in the PDF: no tile is resized, resampled or regenerated.
Tiles are placed on a fixed pitch with a thin gutter, so tiles stored at 255 px
and 256 px both sit unscaled.

Writes PNG + WebP (Pillow) and AVIF (ffmpeg/libaom, if available) into
docs/assets/img/, plus docs/assets/img/manifest.json.
"""
import argparse
import hashlib
import io
import json
import shutil
import subprocess
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets" / "img"
ZOOM = 4  # 72 dpi * 4 = 288 dpi

manifest = []


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16]


def save_variants(img, stem, source, figure, note, widths=()):
    """Save PNG + WebP (+AVIF) at native size, plus optional downscaled widths."""
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    sizes = [img.width] + [w for w in widths if w < img.width]
    for w in sizes:
        im = img if w == img.width else img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        suffix = "" if w == img.width else f"-{w}"
        png = OUT / f"{stem}{suffix}.png"
        webp = OUT / f"{stem}{suffix}.webp"
        im.save(png, optimize=True)
        im.save(webp, quality=88, method=6)
        files = [png.name, webp.name]
        if shutil.which("ffmpeg"):
            avif = OUT / f"{stem}{suffix}.avif"
            r = subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(png), "-c:v", "libaom-av1",
                 "-still-picture", "1", "-crf", "24", "-pix_fmt", "yuv444p", str(avif)],
                capture_output=True,
            )
            if r.returncode == 0:
                files.append(avif.name)
        entries.append({"width": im.width, "height": im.height, "files": files})
    manifest.append({"stem": stem, "figure": figure, "source": source, "note": note, "variants": entries})
    print(f"{stem}: {img.width}x{img.height} -> {len(entries)} size(s)")


def content_bbox(page, y0, y1, x0=40, x1=575, pad=4):
    """Union of drawings, images and text blocks lying entirely within [y0, y1)."""
    def inside(r):
        return y0 <= r.y0 and r.y1 < y1 and x0 <= r.x0 and r.x1 <= x1

    rects = [d["rect"] for d in page.get_drawings() if inside(d["rect"])]
    rects += [pymupdf.Rect(i["bbox"]) for i in page.get_image_info() if inside(pymupdf.Rect(i["bbox"]))]
    rects += [pymupdf.Rect(b[:4]) for b in page.get_text("blocks") if inside(pymupdf.Rect(b[:4]))]
    bb = rects[0]
    for r in rects[1:]:
        bb |= r
    return pymupdf.Rect(bb.x0 - pad, bb.y0 - pad, bb.x1 + pad, bb.y1 + pad)


def render_clip(doc, pno, clip):
    pix = doc[pno].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=clip, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def tiles_on_page(doc, pno):
    """Return [(rect, PIL.Image)] for every embedded raster on the page, untouched."""
    page = doc[pno]
    out = []
    for im in page.get_images(full=True):
        x = doc.extract_image(im[0])
        pil = Image.open(io.BytesIO(x["image"])).convert("RGB")
        for r in page.get_image_rects(im[0]):
            out.append((r, pil))
    return out


def build_grid(tiles, rows, cols, pitch=258, bg=(255, 255, 255)):
    """Place tiles (already sorted row-major) on a fixed pitch without resampling."""
    assert len(tiles) == rows * cols, (len(tiles), rows, cols)
    canvas = Image.new("RGB", (cols * pitch, rows * pitch), bg)
    for k, (_, t) in enumerate(tiles):
        r, c = divmod(k, cols)
        ox = c * pitch + (pitch - t.width) // 2
        oy = r * pitch + (pitch - t.height) // 2
        canvas.paste(t, (ox, oy))
    return canvas


def split_panels(tiles, key):
    """Group tiles into panels with `key(rect)`, then sort row-major inside each."""
    panels = {}
    for r, t in tiles:
        panels.setdefault(key(r), []).append((r, t))
    return [sorted(v, key=lambda rt: (round(rt[0].y0), rt[0].x0)) for _, v in sorted(panels.items())]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", default=str(ROOT / "paper" / "WACV_3315.pdf"))
    ap.add_argument("--supp", default=str(ROOT / "paper" / "DASH_supp.pdf"))
    a = ap.parse_args()
    paper, supp = pymupdf.open(a.paper), pymupdf.open(a.supp)
    psrc = f"{Path(a.paper).name} (sha256 {sha(a.paper)})"
    ssrc = f"{Path(a.supp).name} (sha256 {sha(a.supp)})"

    # Fig. 1: pipeline (main paper p.4, above the caption).
    p = paper[3]
    cap = next(b for b in p.get_text("blocks") if b[4].startswith("Figure 1."))
    clip = content_bbox(p, 55, cap[1] - 1)
    save_variants(render_clip(paper, 3, clip), "fig1-pipeline", f"{psrc} p.4", "Fig. 1",
                  f"Rasterised at {ZOOM * 72} dpi, clip {tuple(round(v, 1) for v in clip)}", widths=(1600, 960))

    # Fig. 2: solution geometry (main paper p.5), split into its two panels.
    p = paper[4]
    cap = next(b for b in p.get_text("blocks") if b[4].startswith("Figure 2."))
    clip = content_bbox(p, 55, cap[1] - 1)
    full = render_clip(paper, 4, clip)
    save_variants(full, "fig2-geometry", f"{psrc} p.5", "Fig. 2",
                  f"Rasterised at {ZOOM * 72} dpi, clip {tuple(round(v, 1) for v in clip)}", widths=(1200,))
    mid = (pymupdf.Rect(clip).x0 + pymupdf.Rect(clip).x1) / 2
    # The dashed divider sits mid-figure; crop each panel on its side.
    left = pymupdf.Rect(clip.x0, clip.y0, mid, clip.y1)
    right = pymupdf.Rect(mid, clip.y0, clip.x1, clip.y1)
    save_variants(render_clip(paper, 4, left), "fig2-composite", f"{psrc} p.5", "Fig. 2 (left)",
                  "Left panel of Fig. 2", widths=(640,))
    save_variants(render_clip(paper, 4, right), "fig2-dash", f"{psrc} p.5", "Fig. 2 (right)",
                  "Right panel of Fig. 2", widths=(640,))

    # Fig. 3: CIFAR-10 teacher vs student (main paper p.8), 2 panels of 5x10.
    t = tiles_on_page(paper, 7)
    xs = sorted(r.x0 for r, _ in t)
    split = (xs[49] + xs[50]) / 2  # 50 tiles per panel
    teacher, student = split_panels(t, key=lambda r: r.x0 > split)
    note = "Embedded sample tiles placed unscaled on a 258 px pitch (2 px gutter); no resampling of samples."
    for name, panel, fig in [("c10-teacher", teacher, "Fig. 3a"), ("c10-student", student, "Fig. 3b")]:
        grid = build_grid(panel, 5, 10)
        save_variants(grid, name, f"{psrc} p.8", fig, note, widths=(1290,))
        # Hero teaser: first row of the same grid (10 classes, matched seeds), cropped, not resampled.
        save_variants(grid.crop((0, 0, grid.width, 258)), f"teaser-{name}", f"{psrc} p.8", f"{fig}, row 1",
                      "Row 1 of the grid above, cropped", widths=(1290,))

    # Supp. Fig. E6 (CIFAR-100, p.13) and E7 (ImageNet-64, p.14): stacked panels.
    for pno, ds, fig in [(12, "c100", "Supp. Fig. E6"), (13, "in64", "Supp. Fig. E7")]:
        t = tiles_on_page(supp, pno)
        ys = sorted(r.y0 for r, _ in t)
        split = (ys[49] + ys[50]) / 2
        teacher, student = split_panels(t, key=lambda r: r.y0 > split)
        for name, panel, sub in [(f"{ds}-teacher", teacher, "a"), (f"{ds}-student", student, "b")]:
            grid = build_grid(panel, 5, 10)
            save_variants(grid, name, f"{ssrc} p.{pno + 1}", f"{fig}{sub}", note, widths=(1290,))
            if ds == "in64":  # hero teaser uses ImageNet-64, row 1, cropped and not resampled
                save_variants(grid.crop((0, 0, grid.width, 258)), f"teaser-{name}", f"{ssrc} p.{pno + 1}",
                              f"{fig}{sub}, row 1", "Row 1 of the grid above, cropped", widths=(1290,))

    # Supp. Fig. E8 (p.15): step-count panels, rows CIFAR-10 / CIFAR-100 / ImageNet-64, columns 50/25/10/5 steps.
    # Each panel is one embedded image; it is only ever downscaled (never upscaled).
    t = tiles_on_page(supp, 14)
    rows_by_y = {}
    for r, im in t:
        rows_by_y.setdefault(round(r.y0), []).append((r, im))
    for (y, row), ds in zip(sorted(rows_by_y.items()), ["c10", "c100", "in64"]):
        for (r, im), steps in zip(sorted(row, key=lambda ri: ri[0].x0), [50, 25, 10, 5]):
            target = min(im.width, 532)
            im2 = im if target == im.width else im.resize((target, target), Image.LANCZOS)
            save_variants(im2, f"e8-{ds}-{steps}", f"{ssrc} p.15", f"Supp. Fig. E8 ({ds}, {steps} steps)",
                          f"Embedded panel, native {im.width}px" + ("" if target == im.width else f", downscaled to {target}px"))

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("manifest:", OUT / "manifest.json")


if __name__ == "__main__":
    main()
