// Per-section screenshots across viewports and themes, for visual review.
// Usage: node shots.mjs [widths=360,390,768,1024,1440,1920] [themes=light,dark]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out', 'shots');
fs.mkdirSync(out, { recursive: true });
const URL_ = process.env.PAGE_URL || 'http://127.0.0.1:8766/';
const widths = (process.argv[2] || '360,390,768,1024,1440,1920').split(',').map(Number);
const themes = (process.argv[3] || 'light,dark').split(',');
const ids = ['top-nav', 'top', 'tldr', 'abstract', 'problem', 'method', 'results', 'samples', 'ablation', 'efficiency', 'limitations', 'bibtex', 'author', 'footer'];

const browser = await chromium.launch();
for (const w of widths) for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: theme, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, `${w}-${theme}-viewport.png`) });
  await p.addStyleTag({ content: '.nav{position:relative !important}' });
  await p.evaluate(() => document.documentElement.classList.add('cv-off'));
  await p.waitForTimeout(300);
  for (const id of ids) {
    const el = await p.$(id === 'footer' ? 'footer' : '#' + id);
    if (el) await el.screenshot({ path: path.join(out, `${w}-${theme}-${id}.png`) });
  }
  await ctx.close();
}
await browser.close();
console.log('done', out);
