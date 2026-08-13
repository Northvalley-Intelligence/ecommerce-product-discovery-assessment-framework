// Export search terms for a Google Keyword Planner demand overlay.
// Emits (a) a single comma-separated line of the genuine shopper terms to paste into Keyword Planner,
// and (b) a CSV with per-store results + relevance + a blank monthly_google_search_volume column.
// Drops internal probes (literal product-names, promo category-labels) — they have no real Google demand.
//
// Usage: node export-terms.mjs <eval-board.json> <out-line.txt> <out.csv>

import { readFileSync, writeFileSync } from 'node:fs';
const [boardPath, linePath, csvPath] = process.argv.slice(2);
if (!boardPath || !linePath || !csvPath) { console.error('usage: node export-terms.mjs <eval-board.json> <out-line.txt> <out.csv>'); process.exit(1); }
const b = JSON.parse(readFileSync(boardPath, 'utf8'));
const KEEP = new Set(['synonym', 'attribute', 'job_function', 'head']);
const stores = Object.keys(b.stores || { IW: 1, SB: 1 });

// per (q) -> per store row
const byQ = {};
for (const r of b.rows) { (byQ[r.q] = byQ[r.q] || {})[r.store] = r; }

// preserve dataset order + first-seen order
const order = ['synonym', 'attribute', 'job_function', 'head', 'literal', 'intent'];
const seen = []; for (const r of b.rows) { if (!seen.find((s) => s.q === r.q)) seen.push({ q: r.q, dataset: r.dataset }); }
seen.sort((a, z) => order.indexOf(a.dataset) - order.indexOf(z.dataset));

// comma line: shopper terms only
const line = seen.filter((s) => KEEP.has(s.dataset)).map((s) => s.q).join(', ');
writeFileSync(linePath, line + '\n');

// CSV
const nd = (r) => (r && r.total > 0 && r.ndcg_pinned != null) ? Math.round(r.ndcg_pinned * 100) + '%' : '';
const esc = (s) => /[",]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
const hdr = ['dataset', 'search_term'];
for (const st of stores) { hdr.push(st + '_results', st + '_relevance'); }
hdr.push('search_status', 'monthly_google_search_volume');
const lines = [hdr.join(',')];
for (const { q, dataset } of seen) {
  const cells = [dataset, esc(q)];
  const totals = stores.map((st) => (byQ[q][st] ? byQ[q][st].total : null));
  for (const st of stores) { const r = byQ[q][st]; cells.push(r ? r.total : '', nd(r)); }
  const any = totals.some((t) => t > 0);
  const all0 = totals.every((t) => t === 0);
  cells.push(all0 ? 'neither -- SEARCH GAP' : (any ? 'returns results' : ''), '');
  lines.push(cells.map((c) => esc(String(c))).join(','));
}
writeFileSync(csvPath, lines.join('\n') + '\n');
console.log(`wrote ${seen.filter((s) => KEEP.has(s.dataset)).length}-term comma line -> ${linePath}`);
console.log(`wrote ${seen.length}-row CSV -> ${csvPath}`);
console.log('\nNext: paste the comma line into Google Keyword Planner, then parse the results with');
console.log('  ~/code/demand-data-generation/scripts/parse-keyword-planner-paste.js  (or the dashboard /api/demand/import).');
console.log('Join volume to each term; rank FAILURES by volume; split search-bugs (stocked) vs assortment-gaps (not stocked).');
