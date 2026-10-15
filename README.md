# DASH project page

Project page for **DASH: Dual-Branch Score Distillation for Guidance-Calibrated Compact Diffusion Models** (WACV 2027, Algorithms Track).

Live URL (once deployed): https://c-loud-nine.github.io/DASH/

The site is plain static HTML, CSS and JS in `docs/`. There is no build step.

```
docs/                    the site (GitHub Pages serves this folder)
  index.html
  data/results.json      every number on the page
  assets/css/site.css    styles, colour tokens, dark mode, self-hosted fonts
  assets/js/main.js      tables, charts, explorer, sliders (reads results.json)
  assets/img/            figures extracted from the paper + manifest.json
  assets/fonts/          Instrument Serif and Inter subsets (OFL)
  assets/vendor/katex/   KaTeX 0.16.11, vendored and pinned
  assets/pdf/            supplementary PDF
  assets/video/          overview video (not added yet, see below)
paper/                   source PDFs used to build the page
tools/                   figure extraction, video encoding, QA scripts
```

## Deploy on GitHub Pages

1. Push this folder to `github.com/C-loud-Nine/DASH`.
2. In the repo, open **Settings → Pages**, set **Source: Deploy from a branch**, branch `main`, folder `/docs`.
3. `docs/.nojekyll` is already present, so files are served as-is.

## Update the numbers

All tables, charts, widgets and inline numbers read from `docs/data/results.json`. To change a result, edit that file only.

- Table rows are arrays in the order given by each table's `columns` list. `null` means "undefined" and renders as a dash.
- Inline numbers in the HTML use `data-k` keys (for example `data-k="t1.DASH (ours).c10_fid"`). The HTML also holds the same value as a static fallback for crawlers and no-JS readers. If you change the JSON, update the fallback too. The audit below flags any mismatch.
- To add the camera-ready rows (the balanced 50/50 branch-supervision baseline and so on), append a row to `table1_main.rows` with `"group": "loss"`, and remove the entry from `pending_camera_ready`.

## Swap in the camera-ready PDF

1. Put the camera-ready PDF in `paper/` (for example `paper/DASH_WACV2027.pdf`) and the supplementary in `paper/DASH_supp.pdf`. Copy the supplementary to `docs/assets/pdf/DASH_supp.pdf` as well.
2. Re-extract the figures (needs Python with PyMuPDF and Pillow; AVIF needs ffmpeg with libaom):
   ```
   python tools/extract_figures.py --paper paper/DASH_WACV2027.pdf --supp paper/DASH_supp.pdf
   ```
   The script finds Fig. 1 and Fig. 2 by their captions. If the page layout changed, check `docs/assets/img/manifest.json` and the outputs. Sample grids are rebuilt from the embedded tiles without resampling.
3. Re-check every value in `results.json` against the new PDF, replace the abstract in `index.html` with the camera-ready text, and update the CVF links (search for `TODO`).

## Add the overview video

```
bash tools/encode_video.sh path/to/dash_overview.mp4
```

Then remove `hidden` from `<section id="video">` and from the hero pill marked `data-video-only` in `docs/index.html`. The player is only inserted when the section is visible, so no media is requested before that.

## QA (optional)

```
cd tools
npm install                 # playwright 1.48.2, lighthouse 12.2.1, axe-core 4.10.2 (pinned)
npx playwright install chromium
node serve.mjs 8766         # gzip static server for docs/, in a second shell
PAGE_URL=http://127.0.0.1:8766/ npm run check       # screenshots 390/1440 px x light/dark, console, overflow, axe
PAGE_URL=http://127.0.0.1:8766/ npm run audit       # every rendered number -> results.json source; writes out/audit.md
PAGE_URL=http://127.0.0.1:8766/ npm run lighthouse  # mobile + desktop scores
node shots.mjs 360,768,1440 light,dark              # per-section screenshots for visual review
npm run assets              # re-render og.png (from tools/og.html) and PNG favicons
```

## Notes on performance testing

Lighthouse's default mobile run slows the CPU 4× and assumes a fast host. On a busy or slow machine (the report shows `benchmarkIndex`; below about 1000 is slow) scale it down, e.g. `CPU_SLOWDOWN=1.5 npm run lighthouse`, or test from a quiet machine or PageSpeed Insights after deploying.

Below-the-fold sections use `content-visibility: auto` to keep first load light. In-page links switch it off before scrolling, so anchors land exactly.

## Credits

Page design and code are original to this project. Fonts: Instrument Serif, Inter and JetBrains Mono (SIL Open Font License), self-hosted. Math: KaTeX (MIT).
