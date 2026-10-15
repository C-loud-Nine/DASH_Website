// Lighthouse (mobile + desktop) against the local server, using Playwright's Chromium.
// Usage: cd tools && npm run serve (other shell) && npm run lighthouse
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.PAGE_URL || 'http://localhost:8765/';
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const cli = path.join(here, 'node_modules', 'lighthouse', 'cli', 'index.js');
const env = { ...process.env, CHROME_PATH: chromium.executablePath() };
for (const preset of ['mobile', 'desktop']) {
  const file = path.join(out, `lh-${preset}.json`);
  const args = [cli, URL_, '--quiet', '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new --no-sandbox',
    '--only-categories=performance,accessibility,best-practices,seo'];
  if (preset === 'desktop') args.push('--preset=desktop');
  // On a slow or busy host, scale CPU throttling to the machine (see Lighthouse's CPU throttling calibration guide).
  if (process.env.CPU_SLOWDOWN && preset === 'mobile') args.push(`--throttling.cpuSlowdownMultiplier=${process.env.CPU_SLOWDOWN}`);
  try { execFileSync(process.execPath, args, { env, stdio: 'inherit' }); } catch (e) { /* Windows temp cleanup can fail after a good run */ }
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log(preset, s, 'benchmarkIndex', Math.round(r.environment.benchmarkIndex), 'LCP', r.audits['largest-contentful-paint'].displayValue, 'CLS', r.audits['cumulative-layout-shift'].displayValue, 'weight', r.audits['total-byte-weight'].displayValue);
  Object.values(r.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable')
    .forEach((a) => console.log('   -', a.id, a.score, a.displayValue || ''));
}
