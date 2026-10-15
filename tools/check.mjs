// Screenshots (390 / 1440 px, light / dark), console errors, horizontal overflow and axe-core.
// Usage: cd tools && npm run serve   (in another shell)   then   npm run check [-- section-id ...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const URL_ = process.env.PAGE_URL || 'http://localhost:8765/';
const sections = process.argv.slice(2);

const browser = await chromium.launch();
let failures = 0;
for (const width of [390, 1440]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Preload assets/.test(m.text())) errors.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await page.goto(URL_, { waitUntil: 'networkidle' });
    // Trigger lazy content (KaTeX, images), then return to top.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > w + 1 && !el.closest('.tablewrap, .eq, .bib pre, .sr-only, .nav__links, svg, .fig__scroll')) bad.push(el.tagName + '.' + el.className + ' ' + Math.round(r.right));
      });
      return { scrollW: document.documentElement.scrollWidth, w, bad: bad.slice(0, 8) };
    });
    const tag = `${width}-${scheme}`;
    if (sections.length) {
      for (const id of sections) {
        const el = await page.$('#' + id);
        if (el) await el.screenshot({ path: path.join(out, `${tag}-${id}.png`) });
      }
    } else {
      await page.screenshot({ path: path.join(out, `${tag}-full.png`), fullPage: true });
    }
    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join('')) }));
    });
    const ok = !errors.length && overflow.scrollW <= overflow.w && !axe.length;
    if (!ok) failures++;
    console.log(`\n[${tag}] ${ok ? 'OK' : 'ISSUES'}  scrollWidth=${overflow.scrollW}/${overflow.w}`);
    errors.forEach((e) => console.log('  console', e));
    overflow.bad.forEach((b) => console.log('  overflow', b));
    axe.forEach((v) => console.log(`  axe ${v.impact} ${v.id} x${v.n}\n     ${v.sample.join('\n     ')}`));
    await ctx.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
