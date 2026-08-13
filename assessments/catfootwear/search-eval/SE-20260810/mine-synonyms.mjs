import { readFileSync, writeFileSync } from 'node:fs';
/*
 * mine-synonyms (stage 2, part 3): the synonyms fall out of the recall misses. For each keyed term,
 * the products the query FAILED to return (recall.miss) are diffed against the ones it found: a word
 * that is frequent in the misses and rare in the hits (and is not the node's own name) is the shopper's
 * word the engine does not map to this node — a synonym candidate, carrying the miss products as SKU
 * evidence. Siblings are never proposed (L06); direction is uni (candidate -> node).
 *
 * Usage: node mine-synonyms.mjs <query-pack.json> <recall.json> <catalog.json> <out synonym-candidates.json>
 */
const [packPath, recallPath, catalogPath, outPath] = process.argv.slice(2);
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const recall = JSON.parse(readFileSync(recallPath, 'utf8'));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const keyByTerm = {}; for (const t of pack.terms) if (t.has_key && t.key) keyByTerm[t.term] = { skus: t.key.skus || [], node_id: t.node_id };
const nodeName = {}; for (const n of catalog.nodes) nodeName[n.node_id] = n;
// sibling set: node_id -> Set(sibling node_ids)
const siblings = {}; for (const [a, b] of (catalog.sibling_blocklist || [])) { (siblings[a] = siblings[a] || new Set()).add(b); (siblings[b] = siblings[b] || new Set()).add(a); }
// singular -> node_id, to detect when a candidate word is actually a sibling node
const nodeBySingularWord = {}; for (const n of catalog.nodes) if (n.singular) for (const w of n.singular.split(/\s+/)) nodeBySingularWord[w] = n.node_id;

const STOP = new Set(['work', 'boot', 'boots', 'shoe', 'shoes', 'footwear', 'mens', 'womens', 'men', 'women', 'the', 'with', 'and', 'for', 'a', 'in', 'to', 'waterproof', 'insulated', 'steel', 'toe', 'composite', 'soft', 'alloy', 'leather', 'inch', 'lightweight', 'slip', 'resistant', 'safety', 'pro', 'size', 'wide']);
const words = (s) => s.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

const candidates = [];
for (const row of recall.rows) {
  if (!row.miss_skus || row.miss_skus.length < 2) continue;
  const key = keyByTerm[row.term]; if (!key) continue;
  const missSet = new Set(row.miss_skus);
  const hits = key.skus.filter((s) => !missSet.has(s));
  const qWords = new Set(words(row.term));
  const missFreq = {}; for (const t of row.miss_skus) for (const w of new Set(words(t))) { if (!qWords.has(w)) missFreq[w] = (missFreq[w] || 0) + 1; }
  const hitFreq = {}; for (const t of hits) for (const w of new Set(words(t))) hitFreq[w] = (hitFreq[w] || 0) + 1;
  for (const [w, mc] of Object.entries(missFreq)) {
    if (mc < 2) continue;
    const missShare = mc / row.miss_skus.length;
    const hitShare = (hitFreq[w] || 0) / (hits.length || 1);
    const lift = +(missShare - hitShare).toFixed(2);
    if (lift < 0.30) continue;
    // sibling guard: if w is a sibling node's singular word, it's a sibling, not a synonym
    const wNode = nodeBySingularWord[w];
    if (wNode && row.node_id && (siblings[row.node_id] || new Set()).has(wNode)) continue;
    candidates.push({
      candidate: w, maps_to_node: row.node_id, maps_to_term: row.term,
      relation: 'node_attr', direction: 'uni',
      lift, miss_share: +missShare.toFixed(2),
      evidence_products: row.miss_skus.filter((t) => new Set(words(t)).has(w)).slice(0, 3),
    });
  }
}
candidates.sort((a, b) => b.lift - a.lift);

const out = {
  candidates_version: '1', retailer: pack.retailer, eval_id: pack.eval_id,
  generated_at: new Date().toISOString(),
  note: 'Directional synonym candidates mined from recall misses. candidate -> maps_to_node (uni). Each carries miss products as evidence. Siblings excluded (L06). These are candidates for review, not confirmed equivalences; a low-confidence key must not drive a finding on its own.',
  candidates,
};
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`mined ${candidates.length} synonym candidates`);
candidates.slice(0, 12).forEach((c) => console.log(`  ${c.candidate} -> ${c.maps_to_term} (lift ${c.lift}, ${c.evidence_products.length} evidence)`));
