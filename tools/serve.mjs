// Minimal static server for ../docs with gzip, approximating GitHub Pages for local QA.
// Usage: node serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const port = Number(process.argv[2] || 8766);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const TEXT = new Set(['.html', '.css', '.js', '.json', '.svg']);

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  let body = fs.readFileSync(file);
  if (TEXT.has(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
  res.writeHead(200, headers);
  res.end(body);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
