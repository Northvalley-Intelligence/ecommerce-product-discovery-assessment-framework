import { readFileSync, writeFileSync } from 'node:fs';
/*
 * measure-recall (stage 2, part 2): for every KEYED term in query-pack.json, run the query through
 * the shopper search engine, capture the FULL result SKU set, and compute
 *     recall = |search results ∩ answer-key SKUs| / |answer-key SKUs|
 * The misses (key SKUs search failed to return) are recorded for synonym mining. Recall is only
 * meaningful for keyed terms and must never be averaged across grade-only datasets (L05/L07).
 *
 * Usage: node measure-recall.mjs <query-pack.json> <search_url_template with {q}> <out recall.json>
 */
const [packPath, tmpl, outPath] = process.argv.slice(2);
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cat Footwear search results expose product TITLES (alt text) but not SKU IDs, so the cross-source
// join key is the normalized product title — the same normalization catalog-capture uses.
const parseSkus = (html) => {
  const s = new Set();
  for (const m of html.matchAll(/alt="([^"]*?),\s*[^",]+,\s*(?:dynamic|static)"/gi)) {
    const d = m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
    if (!/boot|shoe|sneaker|sandal|clog|wellington|chukka|chelsea|moc/i.test(d)) continue;
    const n = d.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(inch|in|cm|mm)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (n) s.add(n);
  }
  return s;
};

const keyed = pack.terms.filter((t) => t.has_key && t.key && Array.isArray(t.key.skus) && t.key.skus.length);
const rows = [];
for (const t of keyed) {
  const url = tmpl.replace('{q}', encodeURIComponent(t.term));
  let searchSkus = new Set(); let status = 0;
  try { const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } }); status = r.status; if (r.status === 200) searchSkus = parseSkus(await r.text()); }
  catch (e) { /* record as 0 */ }
  const keySet = new Set(t.key.skus);
  const hits = [...keySet].filter((s) => searchSkus.has(s));
  const misses = [...keySet].filter((s) => !searchSkus.has(s));
  const recall = keySet.size ? +(hits.length / keySet.size).toFixed(3) : null;
  rows.push({
    term: t.term, dataset: t.dataset, node_id: t.node_id || null, facet: t.facet || null,
    confidence: t.key.confidence, key_size: keySet.size,
    search_total: searchSkus.size, hits: hits.length, recall, miss_skus: misses,
  });
  process.stdout.write(`${t.term}: recall ${recall == null ? '-' : (recall * 100).toFixed(0) + '%'} (${hits.length}/${keySet.size}, search returned ${searchSkus.size})\n`);
  await sleep(350);
}

const byDs = {};
for (const r of rows) { if (r.recall == null) continue; (byDs[r.dataset] = byDs[r.dataset] || []).push(r.recall); }
const summary = {};
for (const d of Object.keys(byDs)) summary[d] = { terms: byDs[d].length, mean_recall: +(byDs[d].reduce((a, b) => a + b, 0) / byDs[d].length).toFixed(3) };

const out = {
  recall_version: '1', retailer: pack.retailer, eval_id: pack.eval_id,
  measured_at: new Date().toISOString(),
  search_template: tmpl,
  note: 'recall = |search ∩ answer-key SKUs| / |answer-key SKUs|. Keyed terms only; confidence carried from the key. Grade-only datasets are absent by design (L05/L07).',
  summary, rows,
};
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log('\n=== mean recall by dataset (keyed terms only) ===');
for (const d of Object.keys(summary)) console.log(`  ${d}: ${(summary[d].mean_recall * 100).toFixed(0)}% over ${summary[d].terms} keyed terms`);
const worst = rows.filter((r) => r.recall != null).sort((a, b) => a.recall - b.recall).slice(0, 8);
console.log('=== worst recall (biggest missed-inventory) ===');
worst.forEach((r) => console.log(`  ${r.term}: ${(r.recall * 100).toFixed(0)}% — missed ${r.miss_skus.length} of ${r.key_size}`));
