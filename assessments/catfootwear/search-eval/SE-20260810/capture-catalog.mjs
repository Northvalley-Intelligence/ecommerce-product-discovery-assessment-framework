import { writeFileSync } from 'node:fs';
/*
 * catalog-capture (stage 1) for Cat Footwear (SFCC/SFRA). Produces catalog.json to
 * schemas/search-eval/catalog.schema.json. No bot protection — runs server-side.
 *
 * Method: each taxonomy node has a PLP (?sz=300 -> full SKU set + sku_count). Each facet
 * value is a filter URL (?prefn1=<field>&prefv1=<value>) whose PLP count is the answer-key
 * size for node x facet-value (the "Chairs + material=plastic = 24" pattern). Node existence
 * itself is the assortment guardrail: no "loafers" node => a loafers zero is assortment, not search.
 */
const BASE = 'https://www.catfootwear.com/US/en/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Curated taxonomy nodes (product categories, not promos). singular = shopper phrasing.
// parent/depth impose the tree used for the sibling blocklist and hyponym direction.
const NODES = [
  ['footwear', 'Footwear', 'footwear', null, 0, null],
  ['work-boots', 'Work Boots', 'work boots', 'footwear', 1, null],
  ['work-shoes', 'Work Shoes', 'work shoes', 'footwear', 1, null],
  ['casual-footwear', 'Casual Footwear', 'casual shoes', 'footwear', 1, null],
  // toe (siblings, single-value)
  ['steel-toe', 'Steel Toe', 'steel toe', 'work-boots', 2, 'toe'],
  ['composite-toe', 'Composite Toe', 'composite toe', 'work-boots', 2, 'toe'],
  ['alloy-toe', 'Alloy Toe', 'alloy toe', 'work-boots', 2, 'toe'],
  ['soft-toe', 'Soft Toe', 'soft toe', 'work-boots', 2, 'toe'],
  ['carbon-composite-toe', 'Carbon Composite Toe', 'carbon composite toe', 'work-boots', 2, 'toe'],
  // style (siblings)
  ['chelsea-work-boots', 'Chelsea Work Boots', 'chelsea boots', 'work-boots', 2, 'style'],
  ['chukka-work-boots', 'Chukka Work Boots', 'chukka boots', 'work-boots', 2, 'style'],
  ['sneaker-work-boots', 'Sneaker Work Boots', 'work sneakers', 'work-boots', 2, 'style'],
  ['hiking-work-boots', 'Hiking Work Boots', 'hiking boots', 'work-boots', 2, 'style'],
  ['pull-ons', 'Pull On Boots', 'pull on boots', 'work-boots', 2, 'style'],
  ['wellingtons', 'Wellingtons', 'wellington boots', 'work-boots', 2, 'style'],
  ['slip-on', 'Slip On', 'slip ons', 'casual-footwear', 2, 'style'],
  // color (siblings, single-value)
  ['black-work-boots', 'Black Work Boots', 'black work boots', 'work-boots', 2, 'color'],
  ['brown-work-boots', 'Brown Work Boots', 'brown work boots', 'work-boots', 2, 'color'],
  ['tan-work-boots', 'Tan Work Boots', 'tan work boots', 'work-boots', 2, 'color'],
  // feature (cross-cutting)
  ['waterproof', 'Waterproof', 'waterproof boots', 'work-boots', 2, 'feature'],
  ['insulated-work-boots', 'Insulated Work Boots', 'insulated boots', 'work-boots', 2, 'feature'],
  ['slip-resistant', 'Slip Resistant', 'slip resistant shoes', 'work-boots', 2, 'feature'],
  ['lightweight-work-boots-shoes', 'Lightweight', 'lightweight work boots', 'work-boots', 2, 'feature'],
  ['breathable-work-boots', 'Breathable Work Boots', 'breathable work boots', 'work-boots', 2, 'feature'],
  ['cold-weather', 'Cold Weather', 'cold weather boots', 'work-boots', 2, 'feature'],
];
// facets whose values are mutually exclusive (one per SKU) -> null_rate computable from counts.
const SINGLE_VALUE = new Set(['toeFeatures', 'refinementColor', 'genericSizeType']);
// the node we expand facet-by-facet into node x facet-value answer keys.
const KEY_FACET_NODE = 'work-boots';

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  return { status: r.status, html: r.status === 200 ? await r.text() : '' };
}
function parseCount(html) { const m = html.match(/([\d,]+)\s+Products/i); return m ? parseInt(m[1].replace(/,/g, '')) : null; }
// Product identity = normalized slug (complete on the PLP: all tiles carry a /slug/id.html URL,
// unlike lazy-loaded alt text). Strip size-units so the slug key matches a search title key
// ("6-inch" <-> "6\""). Color variants share a slug, so distinct slugs = distinct products.
function normKey(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(inch|in|cm|mm)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
function parseProducts(html) {
  const seen = new Set(); const out = [];
  for (const m of html.matchAll(/\/US\/en\/([a-z0-9-]+)\/\d{9,}\.html/g)) {
    const slug = m[1];
    if (!/boot|shoe|sneaker|sandal|clog|wellington|chukka|chelsea|moc|slip|oxford|loafer|pump/i.test(slug)) continue;
    const norm = normKey(slug.replace(/-/g, ' '));
    if (norm && !seen.has(norm)) { seen.add(norm); out.push({ sku: norm, title: slug.replace(/-/g, ' ') }); }
  }
  return out;
}
// facet rails: field -> [values]
function parseFacets(html) {
  const rails = {};
  for (const m of html.matchAll(/prefn1=([a-zA-Z]+)&(?:amp;)?prefv1=([^"&]+)[^>]*?data-filter-value="([^"]+)"/g)) {
    const field = m[1]; const val = decodeURIComponent(m[3] || m[2]);
    (rails[field] = rails[field] || new Set()).add(val);
  }
  // fallback: data-filter-name/value pairs
  for (const m of html.matchAll(/data-filter-name="([^"]+)"\s+data-filter-value="([^"]+)"[^>]*prefn1=([a-zA-Z]+)/g)) {
    (rails[m[3]] = rails[m[3]] || new Set()).add(m[2]);
  }
  const out = {}; for (const f of Object.keys(rails)) out[f] = [...rails[f]];
  return out;
}

const nodesOut = []; const skusMap = {}; const facetsOut = [];
for (const [slug, name, singular, parent, depth, group] of NODES) {
  const { status, html } = await get(BASE + slug + '/?sz=300');
  if (status !== 200) { nodesOut.push({ node_id: slug, node_name: name, parent_id: parent, depth, url: BASE + slug + '/', sku_count: 0, singular }); await sleep(400); continue; }
  const prods = parseProducts(html); const skus = prods.map(p=>p.sku); const count = skus.length;
  nodesOut.push({ node_id: slug, node_name: name, parent_id: parent, depth, url: BASE + slug + '/', sku_count: skus.length, singular });
  prods.forEach((pr) => { if (!skusMap[pr.sku]) skusMap[pr.sku] = { sku: pr.sku, title: pr.title, node_ids: [] }; if (!skusMap[pr.sku].node_ids.includes(slug)) skusMap[pr.sku].node_ids.push(slug); });
  process.stdout.write(`${slug}: ${count} products, ${skus.length} skus\n`);
  await sleep(350);

  // expand facet rails into node x facet-value answer keys for the anchor node
  if (slug === KEY_FACET_NODE) {
    const rails = parseFacets(html);
    for (const field of Object.keys(rails)) {
      if (['genericSizeType', 'collection'].includes(field)) continue; // size/collection are not relevance facets
      const values = [];
      for (const val of rails[field].slice(0, 8)) {
        const fu = `${BASE}${slug}/?prefn1=${field}&prefv1=${encodeURIComponent(val)}&sz=300`;
        const fr = await get(fu);
        const vskus = parseProducts(fr.html).map(pp=>pp.sku);
        values.push({ value: val, count: vskus.length, skus: vskus });
        process.stdout.write(`   ${field}=${val}: ${vskus.length}\n`);
        await sleep(350);
      }
      const sum = values.reduce((a, v) => a + v.count, 0);
      const single = SINGLE_VALUE.has(field);
      const null_rate = single ? Math.max(0, Math.min(1, +(1 - sum / (count || 1)).toFixed(2))) : null;
      facetsOut.push({ node_id: slug, facet: field, cross_cutting: !single, null_rate: null_rate == null ? undefined : null_rate, values });
    }
  }
}

// sibling blocklist: node pairs sharing a parent
const byParent = {}; for (const n of nodesOut) { if (n.parent_id) (byParent[n.parent_id] = byParent[n.parent_id] || []).push(n.node_id); }
const blocklist = [];
for (const p of Object.keys(byParent)) { const ids = byParent[p]; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) blocklist.push([ids[i], ids[j]]); }

const catalog = {
  catalog_version: '1', retailer: 'catfootwear', eval_id: 'SE-20260810',
  captured_at: new Date().toISOString(),
  source: { method: 'plp_json', base_url: BASE, notes: 'SFCC/SFRA category PLPs via ?sz=300; facet values via ?prefn1/prefv1 filter URLs. Curated taxonomy nodes (promo/sale pages excluded).' },
  facet_provenance: 'unknown',
  nodes: nodesOut, facets: facetsOut, sibling_blocklist: blocklist,
  skus: Object.values(skusMap),
  limitations: [
    'facet_provenance could not be verified with the merchandiser; facets appear to be structured product attributes (toe type, safety features) rather than title-derived, so circularity risk is low, but answer keys are marked low-confidence per L05.',
    'Node x facet-value counts captured for the anchor node (work-boots) only; other nodes carry sku_count and SKU sets.',
    'null_rate computed for single-value facets (toe, color); multi-value feature facets omit null_rate (cannot derive from counts alone).',
    'Taxonomy is Cat Footwear\'s faceted category landing pages; absence of a node (loafers, moccasins, oxfords, sandals) is the assortment-gap signal.',
  ],
};
writeFileSync('catalog.json', JSON.stringify(catalog, null, 1));
console.log(`\ncatalog.json: ${nodesOut.length} nodes, ${Object.keys(skusMap).length} skus, ${facetsOut.length} facets, ${blocklist.length} sibling pairs`);
