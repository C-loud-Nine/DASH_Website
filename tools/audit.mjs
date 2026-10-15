// Accuracy audit: every number rendered on the page must trace to data/results.json
// (or to a short, documented list of protocol constants). Writes out/audit.md.
// Usage: cd tools && npm run serve (other shell) && npm run audit
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(fs.readFileSync(path.join(here, '..', 'docs', 'data', 'results.json'), 'utf8'));
const URL_ = process.env.PAGE_URL || 'http://localhost:8765/';

// 1. Every numeric value in the JSON, with its source path and paper location.
const known = new Map(); // formatted string -> [sources]
function add(str, src) { if (!known.has(str)) known.set(str, []); known.get(str).push(src); }
function walk(node, p, paperSrc) {
  if (node && typeof node === 'object') {
    const ps = node._source || paperSrc;
    if (Array.isArray(node.columns) && Array.isArray(node.rows)) {
      node.rows.forEach((r) => r.forEach((v, i) => {
        const src = `${p}[${r[0]}].${node.columns[i]} — ${ps}`;
        if (typeof v === 'number') fmt(v).forEach((s) => add(s, src));
        else if (typeof v === 'string') (v.match(/\d+(?:\.\d+)?/g) || []).forEach((s) => add(s, src));
      }));
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'rows') walk(v, p ? `${p}.${k}` : k, ps);
  } else if (typeof node === 'number') fmt(node).forEach((s) => add(s, `${p} — ${paperSrc}`));
  else if (typeof node === 'string') (node.match(/\d+(?:\.\d+)?/g) || []).forEach((s) => add(s, `${p} (text) — ${paperSrc}`));
}
function fmt(v) { return [0, 1, 2, 3].map((d) => v.toFixed(d)); }
walk(D, '', '');

// Values computed from the JSON on the page (differences, TAG endpoints).
const t3 = Object.fromEntries(D.table3_ablation.rows.map((r) => [r[0], r]));
const t1 = Object.fromEntries(D.table1_main.rows.map((r) => [r[0], r]));
const derived = {
  [(t3['No transfer: frozen Min-SNR'][4] - t3['DASH (ours)'][4]).toFixed(2)]: 'Table 3: frozen Min-SNR − DASH, C10 FID (paper §1: 2.60)',
  [(t3['No transfer: frozen Min-SNR'][6] - t3['DASH (ours)'][6]).toFixed(2)]: 'Table 3: frozen Min-SNR − DASH, C100 FID (paper §1: 2.67)',
  [(t3['TIRT relearned from λ=0'][4] - t3['DASH (ours)'][4]).toFixed(2)]: 'Table 3: relearned − DASH, C10 FID (paper §3.4.2: 3.84)',
  [(t3['TIRT relearned from λ=0'][6] - t3['DASH (ours)'][6]).toFixed(2)]: 'Table 3: relearned − DASH, C100 FID (paper §3.4.2: 3.94)',
  [(1 - t1['DASH (ours)'][6]).toFixed(2)]: '1 − ρ for DASH, Table 1',
  [(t1['Single-head, w-conditioned'][4] - t1['DASH (ours)'][4]).toFixed(2)]: 'Table 1: single-head − DASH C100 FID (paper §4.2: 13.03)'
};
const sg = (x) => 1 / (1 + Math.exp(-x));
const T = D.tag;
derived[(T.w_min + (T.w_max - T.w_min) * sg(T.kappa * 0.5)).toFixed(2)] = 'Eq. 3 at t = 0 (computed)';
derived[(T.w_min + (T.w_max - T.w_min) * sg(-T.kappa * 0.5)).toFixed(2)] = 'Eq. 3 at t = T (computed)';
for (const r of D.fixed_vs_tag.rows) derived['+' + (r[1] - r[2]).toFixed(2)] = derived[(r[1] - r[2]).toFixed(2)] = `Supp. Table D16: ${r[0]} fixed − TAG`;
for (const [k, v] of Object.entries(derived)) add(k, v);

// 2. Protocol constants and labels that are not results (documented here, not in the JSON).
const constants = {
  '2027': 'venue year', '2023': 'Meng et al., CVPR 2023', '2026': 'last-updated date', '15': 'last-updated date',
  '42': 'seed', '123': 'seed', '456': 'seed', '50': '50-step DDIM / 50K samples', '50K': 'protocol', '3': 'three seeds',
  '5': 'equation number / 5×10 grid', '6': 'equation number', '7': 'equation number', '8': 'equation number',
  '2': 'equation number / two passes', '1': 'equation / affiliation / table number', '0': 'axis / slider value',
  '10': '5×10 grid', '64': 'batch size / channels / ImageNet-64', '100': 'CIFAR-100', '32': '32×32',
  '4': 'section ref / w = 4', '3.4.1': 'section ref', '4.2': 'section ref', 'C.1': 'section ref',
  '48': 'channel width (Supp. D14)', '96': 'channel width (Supp. D14)', '128': 'teacher channels',
  '1.5': 'w slider min', '6.0': 'w slider max', '0.00': 'slider readout', '0.10': 'Table 1 footnote (ρ < 0.10)',
  '0.6': 'axis tick', '0.7': 'axis tick', '0.8': 'axis tick', '0.9': 'axis tick', '1.0': 'axis tick', '0.4': 'axis tick', '0.5': 'axis tick',
  '0.60': 'axis tick', '0.65': 'axis tick', '0.70': 'axis tick', '0.85': 'axis tick', '0.90': 'axis tick', '0.95': 'axis tick', '0.25': 'axis tick', '0.30': 'axis tick', '0.45': 'axis tick',
  '250': 'axis tick', '500': 'axis tick', '750': 'axis tick', '2.0': 'axis tick', '3.0': 'axis tick'
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } });
await page.waitForTimeout(800);
const found = await page.evaluate(() => {
  const out = [];
  const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest('script, style, .katex, template, [hidden], .sr-only, #bib-text, .abstract')) continue;
    const txt = n.textContent;
    const nums = txt.match(/\d+(?:\.\d+)?K?/g);
    if (!nums) continue;
    const sec = el.closest('section');
    const loc = (sec ? '#' + sec.id : '?') + ' ' + (el.closest('[id]') && el.closest('[id]') !== sec ? '#' + el.closest('[id]').id : el.tagName.toLowerCase());
    nums.forEach((v) => out.push({ v, loc, ctx: txt.trim().slice(0, 70), bound: !!el.closest('[data-k]') }));
  }
  return out;
});
// Static fallbacks in the HTML (seen without JS, e.g. by crawlers) must equal the JSON-bound values.
const bound = await page.evaluate(() => [...document.querySelectorAll('[data-k]')].map((n) => [n.getAttribute('data-k'), n.textContent]));
const nojs = await browser.newContext({ javaScriptEnabled: false });
const p2 = await nojs.newPage();
await p2.goto(URL_);
const fallback = await p2.evaluate(() => [...document.querySelectorAll('[data-k]')].map((n) => [n.getAttribute('data-k'), n.textContent]));
const mismatch = bound.filter((b, i) => b[1] !== fallback[i][1]).map((b, i) => `${b[0]}: rendered "${b[1]}" vs static "${fallback[bound.indexOf(b)][1]}"`);
console.log(`data-k bindings: ${bound.length}, static/JSON mismatches: ${mismatch.length}`);
mismatch.forEach((m) => console.log('  MISMATCH ' + m));
await browser.close();

const rows = [], unknown = [];
for (const f of found) {
  const src = known.get(f.v) || (constants[f.v] ? ['constant: ' + constants[f.v]] : null);
  if (!src) unknown.push(f);
  rows.push(`| ${f.loc} | ${f.v} | ${src ? src[0].replace(/\|/g, '/') : '**UNMATCHED**'} |`);
}
const uniq = [...new Set(rows)];
const md = ['# Accuracy audit', '', `Page: ${URL_}`, `Numbers found: ${found.length}; unique rows: ${uniq.length}; unmatched: ${unknown.length}`, '',
  '| Page location | Value | Source |', '|---|---|---|', ...uniq, '',
  '## Unmatched', ...unknown.map((u) => `- ${u.loc}: **${u.v}** in "${u.ctx}"`)].join('\n');
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'audit.md'), md);
console.log(`numbers: ${found.length}, unique rows: ${uniq.length}, unmatched: ${unknown.length}`);
unknown.forEach((u) => console.log(`  UNMATCHED ${u.v} @ ${u.loc} :: ${u.ctx}`));
