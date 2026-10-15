// Renders the Open Graph card (1200x630) and PNG favicons with headless Chromium.
// Usage: cd tools && npm run assets
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const img = path.join(here, '..', 'docs', 'assets', 'img');
const browser = await chromium.launch();

const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.goto(pathToFileURL(path.join(here, 'og.html')).href, { waitUntil: 'networkidle' });
await og.evaluate(() => document.fonts.ready);
await og.screenshot({ path: path.join(img, 'og.png') });
console.log('og.png');

const svg = fs.readFileSync(path.join(img, 'favicon.svg'), 'utf8');
for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: path.join(img, name), omitBackground: true });
  console.log(name);
}
await browser.close();
