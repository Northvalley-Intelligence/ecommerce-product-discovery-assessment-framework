import { readFileSync, writeFileSync } from 'node:fs';
/*
 * build-category-keys (stage 2, part 1): catalog.json + a term list -> query-pack.json.
 * Attaches an answer key to every term that maps to a catalog node (or node x facet), so
 * recall has a denominator. Grade-only datasets (job_function, intent) stay has_key:false —
 * they have no node and no filter, and recall must never be averaged across them (skill L05/L07).
 * Confidence follows the gate: facet_provenance unknown/text_classifier -> low; null_rate>0.30 -> no key.
 *
 * Usage: node build-category-keys.mjs <catalog.json> <terms.json [[q,dataset],...]> <out query-pack.json>
 */
const [catalogPath, termsPath, outPath] = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const terms = JSON.parse(readFileSync(termsPath, 'utf8'));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// node lookup by singular and by a few derived forms
const nodeBySingular = {};
for (const n of catalog.nodes) { if (n.singular) nodeBySingular[norm(n.singular)] = n; }
const skusOfNode = {};
for (const n of catalog.nodes) skusOfNode[n.node_id] = new Set();
for (const s of catalog.skus) for (const nid of (s.node_ids || [])) if (skusOfNode[nid]) skusOfNode[nid].add(s.sku);

// provenance -> confidence cap
const provCap = (catalog.facet_provenance === 'text_classifier' || catalog.facet_provenance === 'unknown') ? 'low' : 'high';

// match a query term to a node: exact singular, else the singular is contained in the term
function matchNode(q) {
  const nq = norm(q);
  if (nodeBySingular[nq]) return nodeBySingular[nq];
  // longest singular that is a whole-word substring of the term
  let best = null;
  for (const [sing, node] of Object.entries(nodeBySingular)) {
    if (node.node_id === 'footwear') continue;
    const re = new RegExp('(^| )' + sing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)');
    if (re.test(nq) && (!best || sing.length > best.sing.length)) best = { sing, node };
  }
  return best ? best.node : null;
}

const packTerms = [];
const orphans = [];
const seen = new Set();

for (const [q, dataset] of terms) {
  if (seen.has(norm(q))) continue; seen.add(norm(q));
  // grade-only datasets keep no key
  if (dataset === 'job_function' || dataset === 'intent' || dataset === 'literal' || dataset === 'part_number') {
    const ds = dataset === 'literal' ? 'brand' : dataset;
    // source records HOW the term was selected into the dataset (see SKILL §6): use-case and
    // natural-language queries are authored to probe compositional understanding; brands and
    // part numbers are hand-typed known-item lookups. None is anchored to a catalog node — and
    // part_number/cross-reference/serial demand is the structural blind spot of category-recall:
    // it is the head of a parts catalog's demand and cannot be synthesized from nodes or facets.
    const src = dataset === 'job_function' ? 'use_case' : dataset === 'intent' ? 'natural_language' : dataset === 'part_number' ? 'part_number' : 'authored';
    packTerms.push({ term: q, dataset: ds, has_key: false, relation: dataset === 'literal' ? 'authored' : null, source: src });
    continue;
  }
  const node = matchNode(q);
  if (!node) {
    // synonym/attribute term with no catalog node -> hand-authored shopper vocabulary the taxonomy
    // has no category for. Kept to test whether search maps it; source = authored, no answer key.
    packTerms.push({ term: q, dataset, has_key: false, relation: null, source: 'authored' });
    orphans.push(q);
    continue;
  }
  const captured = skusOfNode[node.node_id].size;
  // Partial-capture guard: a recall key is only honest when the node was captured in FULL. If we
  // read fewer SKUs than the node's true sku_count (enterprise catalogs too large for browser-eval
  // to page through), the captured set is a SAMPLE — keying on it would shrink the denominator and
  // overstate recall. Such a term stays catalog-anchored (source=catalog_node, node_id kept) but
  // carries no key, so the board grades it without inventing a recall number.
  const full = captured > 0 && captured >= node.sku_count;
  const size = full ? captured : node.sku_count;
  // node membership key: null_rate 0 (the node set is definitional); confidence capped by provenance.
  // source = catalog_node: the term matches a real category the store organizes products under.
  packTerms.push({
    term: q, dataset,
    has_key: full,
    relation: null,
    source: 'catalog_node',
    node_id: node.node_id,
    query_template: '{node.singular}',
    key: full ? { size: captured, null_rate: 0, confidence: provCap === 'low' ? 'low' : 'medium', skus: [...skusOfNode[node.node_id]], source_url: node.url } : null,
  });
}

// node x facet keyed terms (attribute combos) from catalog facets that pass the null-rate gate
for (const f of (catalog.facets || [])) {
  const node = catalog.nodes.find((n) => n.node_id === f.node_id); if (!node) continue;
  const hollow = f.null_rate != null && f.null_rate > 0.30;
  const computable = f.null_rate != null; // multi-value facets omit null_rate -> cannot trust -> no key
  for (const v of f.values) {
    if (v.count < 1) continue;
    const term = norm(v.value + ' ' + node.singular);
    if (seen.has(term)) continue; seen.add(term);
    const keyable = computable && !hollow;
    // source = catalog_facet: synthesized from a node × a catalog filter value (a refinement the store exposes).
    packTerms.push({
      term, dataset: 'attribute',
      has_key: keyable,
      relation: 'node_attr', direction: 'uni',
      source: 'catalog_facet',
      node_id: node.node_id, facet: f.facet, facet_value: v.value,
      query_template: '{facet_value} {node.singular}',
      key: keyable ? { size: v.count, null_rate: f.null_rate, confidence: provCap, skus: v.skus || [], source_url: node.url } : null,
    });
  }
}

const pack = {
  pack_version: '1', retailer: catalog.retailer, eval_id: catalog.eval_id,
  generated_at: new Date().toISOString(),
  catalog_ref: catalogPath.split('/').pop(),
  generator: ['category-recall'],
  terms: packTerms,
  orphans,
};
writeFileSync(outPath, JSON.stringify(pack, null, 1));
const keyed = packTerms.filter((t) => t.has_key).length;
console.log(`query-pack: ${packTerms.length} terms, ${keyed} keyed, ${orphans.length} orphans (no node)`);
console.log('sample keyed:', packTerms.filter((t) => t.has_key).slice(0, 6).map((t) => t.term + '=' + t.key.size).join(', '));
