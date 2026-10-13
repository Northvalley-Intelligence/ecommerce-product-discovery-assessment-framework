#!/usr/bin/env node
// Builds share-dist/: a static, read-only snapshot of the four search-eval
// boards (index.html + share-dist/_snap/*), served by share/worker.mjs.
//
// 1. Starts the real dashboard server on a free localhost port.
// 2. Drives it with Playwright (every non-localhost request is blocked),
//    opening each of the four sites and expanding every dataset row, while
//    recording every GET to /api/* and /artifact*.
// 3. Fetches each recorded URL and stores the body under _snap/<sha256>.
// No request is made to any store or external host.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDashboardServer, dashboardPage } from '../src/evaluator/dashboard-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'share-dist');
const SNAP = path.join(OUT, '_snap');
const SITES = ['biggreenegg', 'catfootwear', 'partscat', 'target'];
const ALLOWED = new Set(SITES);

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Mirrors the Worker's key normalisation: the report-PDF link carries a
// cache-busting &t=<epoch> that must not be part of the snapshot key.
function snapshotKey(url) {
  const u = new URL(url, 'http://localhost');
  if (u.pathname.startsWith('/artifact')) u.searchParams.delete('t');
  return u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
}

// Only the four shared sites may appear in any listing.
function filterBody(key, contentType, buffer) {
  if (!contentType.includes('json')) return buffer;
  // Never publish this machine's absolute paths.
  buffer = Buffer.from(buffer.toString('utf8').split(ROOT + '/').join(''));
  const pathname = key.split('?')[0];
  if (pathname !== '/api/sites' && pathname !== '/api/inspections') return buffer;
  const data = JSON.parse(buffer.toString('utf8'));
  if (!Array.isArray(data)) throw new Error(`${pathname}: expected a JSON array`);
  const kept = data.filter((item) => ALLOWED.has(item.target_id));
  return Buffer.from(JSON.stringify(kept));
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(SNAP, { recursive: true });

  const dashboard = await createDashboardServer({ rootDir: ROOT, host: '127.0.0.1', port: 0 });
  const base = dashboard.url;
  const recorded = new Set();
  const blocked = [];
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/*', (route) => {
      const target = new URL(route.request().url());
      const { hostname, protocol } = target;
      if (protocol === 'data:' || hostname === '127.0.0.1' || hostname === 'localhost') {
        if (route.request().method() !== 'GET') return route.abort();
        // Crawl the exact page and listings the share site will serve, not the operator view.
        if (target.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: dashboardPage({ share: true }) });
        if (target.pathname === '/api/sites' || target.pathname === '/api/inspections') {
          return route.fetch().then(async (response) => {
            const body = filterBody(target.pathname, 'application/json', Buffer.from(await response.body()));
            return route.fulfill({ response, body });
          });
        }
        return route.continue();
      }
      blocked.push(route.request().url());
      return route.abort();
    });
    page.on('request', (request) => {
      if (request.method() !== 'GET') return;
      const u = new URL(request.url());
      if (u.origin !== base) return;
      if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/artifact')) recorded.add(snapshotKey(request.url()));
    });

    await page.goto(base + '/', { waitUntil: 'networkidle' });
    for (const site of SITES) {
      await page.click(`.site-nav[data-target="${site}"]`);
      await page.waitForSelector('#searchEval details.dsrow', { timeout: 30000 });
      await page.waitForLoadState('networkidle');
      // Expand every dataset row (the term rows inside are static markup).
      for (const summary of await page.$$('#searchEval details.dsrow > summary')) await summary.click();
      // Report-PDF and any other artifact links shown on the board.
      for (const href of await page.$$eval('#searchEval a[href^="/artifact"]', (as) => as.map((a) => a.getAttribute('href')))) {
        recorded.add(snapshotKey(href));
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  const manifest = {};
  for (const key of [...recorded].sort()) {
    const response = await fetch(base + key);
    if (!response.ok) {
      // A report PDF link the live dashboard also 404s on (no PDF built yet): leave it a 404 here too.
      if (key.startsWith('/artifact') && response.status === 404) { console.warn(`skipped (404 on the dashboard too): ${key}`); continue; }
      throw new Error(`snapshot fetch failed: ${key} -> ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const body = filterBody(key, contentType, Buffer.from(await response.arrayBuffer()));
    const file = sha(key);
    fs.writeFileSync(path.join(SNAP, file), body);
    manifest[key] = { file, 'content-type': contentType };
  }
  fs.writeFileSync(path.join(SNAP, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(OUT, 'index.html'), dashboardPage({ share: true }));

  await new Promise((resolve) => dashboard.server.close(resolve));
  dashboard.server.closeAllConnections?.();
  console.log(`share-dist: ${Object.keys(manifest).length} snapshots written; ${blocked.length} non-localhost request(s) blocked`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
