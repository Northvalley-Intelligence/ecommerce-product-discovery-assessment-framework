// Capture a WooCommerce store's REAL shopper search (the storefront /?s=), NOT the Store API.
// Server-rendered HTML is parsed for product titles. Bounded + paced (no server load).
//
// Usage: node capture-storefront.mjs <domain> <query-pack.json> <out.json> [titleRegexSource]
//   <domain>            e.g. www.industrywest.com  (no protocol)
//   <query-pack.json>   assets/furniture-queries.json (or any {synonym,attribute,job_function,head_terms})
//   <out.json>          where to write captures
//   [titleRegexSource]  optional override for the product-title regex; default matches
//                       <h2 class="utility-2-bold">TITLE</h2>. Inspect the store's search HTML
//                       and set the right selector for the theme (e.g. woocommerce-loop-product__title).
//
// Output rows: [{retailer, dataset, q, total, n, items:[{i,t}], source:'storefront'}]

import { readFileSync, writeFileSync } from 'node:fs';
const [domain, packPath, outPath, titleRe] = process.argv.slice(2);
if (!domain || !packPath || !outPath) { console.error('usage: node capture-storefront.mjs <domain> <pack.json> <out.json> [titleRegexSource]'); process.exit(1); }
const UA = 'Northvalley-Ecommerce-Inspection/0.1';
const TITLE = new RegExp(titleRe || '<h2 class="utility-2-bold">([^<]+)</h2>', 'g');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pack = JSON.parse(readFileSync(packPath, 'utf8'));

// dedupe query list with dataset tags (first dataset wins)
const seen = new Set(); const queries = [];
const add = (q, dataset) => { if (!q || seen.has(q)) return; seen.add(q); queries.push({ q, dataset }); };
for (const s of (pack.synonym || [])) for (const v of s.variants) add(v, 'synonym');
for (const q of (pack.attribute || [])) add(q, 'attribute');
for (const q of (pack.job_function || [])) add(q, 'job_function');
for (const q of (pack.head_terms || [])) add(q, 'head');

async function search(q) {
  const url = `https://${domain}/?s=${encodeURIComponent(q)}&post_type=product`;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, connection: 'close' } });
      const html = await r.text();
      const names = [...html.matchAll(TITLE)].map((m) => m[1].trim());
      await sleep(900);
      return { total: names.length, items: names.slice(0, 8).map((t, i) => ({ i: String(i + 1), t })) };
    } catch (e) { await sleep(1500 * (i + 1)); }
  }
  return { total: null, items: [], error: true };
}

const retailer = domain.replace(/^www\./, '').split('.')[0];
const out = [];
for (const { q, dataset } of queries) {
  const { total, items, error } = await search(q);
  out.push({ retailer, dataset, q, total, n: items.length, items, source: 'storefront' });
  console.log(`${dataset.padEnd(12)} ${String(total).padStart(4)}  ${q}${error ? ' [ERR]' : ''}`);
}
writeFileSync(outPath, JSON.stringify(out, null, 0));
console.log(`\ncaptured ${out.length} -> ${out.filter((c) => c.total > 0).length} with results, ${out.filter((c) => c.total === 0).length} zero-result. wrote ${outPath}`);
