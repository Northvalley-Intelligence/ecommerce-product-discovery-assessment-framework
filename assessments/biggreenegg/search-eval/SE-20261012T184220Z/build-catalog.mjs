// Per-store glue for biggreenegg.com (Shopify): raw /products.json + /collections/<h>/products.json -> catalog.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
const products = [];
for (const f of readdirSync(join(dir, 'raw')).filter((f) => /^products-p\d+\.json$/.test(f))) products.push(...J('raw/' + f).products);
const byId = new Map(products.map((p) => [p.id, p]));
const colls = J('raw/collections.json').collections;
const collMeta = Object.fromEntries(colls.map((c) => [c.handle, c]));
// node_id, collection handle, display name, singular, parent
const N = [
  ['grills', null, 'Grills (merchant groups)', '', null],
  ['eggs', 'all-eggs-egg-packages', 'Eggs & Egg Packages', 'egg', 'grills'],
  ['rotisserie', 'rotisserie', 'Rotisserie', 'rotisserie', 'grills'],
  ['furniture', null, 'Tables, Stands & Nests', '', null],
  ['tables-stands', 'all-modular-system-tables-stands', 'Tables, Carts, Stands & Modular Systems', 'table', 'furniture'],
  ['modular-nest', 'modular-nest', 'Modular Nest System', 'nest', 'furniture'],
  ['grill-accessories', null, 'Grill Accessories', '', null],
  ['covers', 'covers', 'Covers', 'cover', 'grill-accessories'],
  ['cleaning', 'cleaning', 'Cleaning', 'cleaner', 'grill-accessories'],
  ['ceramics', 'ceramics', 'Ceramics', 'ceramic', 'grill-accessories'],
  ['racks-grids', 'racks-grids', 'Racks & Grids', 'rack', 'grill-accessories'],
  ['eggspander', 'eggspander', 'EGGspander', 'eggspander', 'grill-accessories'],
  ['hell-hands', 'hell-hands', 'Hell Hands', 'hell hands', 'grill-accessories'],
  ['replacement-parts', 'replacement-parts', 'EGG Replacement Parts', 'replacement part', 'grill-accessories'],
  ['fuel', null, 'Charcoal, Wood & Starters', '', null],
  ['charcoal', 'charcoal', 'Charcoal', 'charcoal', 'fuel'],
  ['wood-chips-chunks', 'wood-chips-chunks', 'Wood Chips & Chunks', 'wood chip', 'fuel'],
  ['fire-starters', 'fire-starters', 'Fire Starters', 'fire starter', 'fuel'],
  ['igniters', 'igniters', 'Igniters', 'igniter', 'fuel'],
  ['temperature', null, 'Temperature', '', null],
  ['thermometers', 'thermometers', 'Thermometers', 'thermometer', 'temperature'],
  ['temperature-control', 'temperature-control', 'Temperature Control', 'temperature controller', 'temperature'],
  ['cooking', null, 'Cookware & Tools', '', null],
  ['cookware', 'cookware', 'Cookware', 'cookware', 'cooking'],
  ['baking-accessories', 'baking-accessories', 'Baking Accessories', 'baking accessory', 'cooking'],
  ['pizza-accessories', 'pizza-accessories', 'Pizza Accessories', 'pizza accessory', 'cooking'],
  ['spatulas', 'spatulas', 'Spatulas', 'spatula', 'cooking'],
  ['tongs', 'tongs', 'Tongs', 'tongs', 'cooking'],
  ['knives', 'knives', 'Knives', 'knife', 'cooking'],
  ['cutting-boards', 'cutting-boards', 'Cutting Boards', 'cutting board', 'cooking'],
  ['food', null, 'Food', '', null],
  ['seasonings-rubs', 'seasonings-rubs', 'Seasonings & Rubs', 'rub', 'food'],
  ['barbecue-wing-sauce', 'barbecue-wing-sauce', 'Barbecue & Wing Sauce', 'sauce', 'food'],
  ['lifestyle', null, 'Lifestyle', '', null],
  ['hats', 'hats', 'Hats', 'hat', 'lifestyle'],
  ['mens-apparel', 'mens-apparel', "Men's Apparel", "men's apparel", 'lifestyle'],
  ['womens-apparel', 'womens-apparel', "Women's Apparel", "women's apparel", 'lifestyle'],
  ['bags-coolers', 'bags-coolers', 'Bags & Coolers', 'cooler', 'lifestyle'],
  ['drink-barware', 'drink-barware', 'Drink & Barware', 'barware', 'lifestyle'],
  ['cookbooks', 'cookbooks', 'Cookbooks', 'cookbook', 'lifestyle'],
  ['signs', 'signs', 'Signs', 'sign', 'lifestyle'],
  ['toys-games', 'toys-games', 'Toys & Games', 'toy', 'lifestyle'],
];
const members = {}; // node_id -> Set(handle)
const nodeIds = {};  // handle -> [node ids]
const nodes = [];
const depth = (id) => { const n = N.find((x) => x[0] === id); return n[4] ? 1 + depth(n[4]) : 0; };
for (const [id, h, name, sing, parent] of N) {
  members[id] = new Set();
  if (h) { const d = J(`raw/coll/${h}.json`); for (const p of d.products) { members[id].add(p.handle); (nodeIds[p.handle] ||= []).push(id); } }
}
// group nodes = union of children
for (const [id, h, , , parent] of N) if (h && parent) { for (const x of members[id]) { members[parent].add(x); const a = (nodeIds[x] ||= []); if (!a.includes(parent)) a.push(parent); } }
for (const [id, h, name, sing, parent] of N) {
  nodes.push({ node_id: id, node_name: name, parent_id: parent, depth: depth(id), url: h ? `https://biggreenegg.com/collections/${h}` : 'https://biggreenegg.com/', sku_count: members[id].size, ...(sing ? { singular: sing } : {}) });
}
// facets: Shopify product options (Size / Color etc.) entered by merchandisers, per node
const byHandle = new Map(products.map((p) => [p.handle, p]));
const facets = [];
for (const n of nodes) {
  if (n.sku_count < 4) continue;
  const mem = [...members[n.node_id]].map((h) => byHandle.get(h)).filter(Boolean);
  const names = new Set(mem.flatMap((p) => p.options.filter((o) => o.name !== 'Title').map((o) => o.name)));
  for (const on of names) {
    const vals = new Map(); let withVal = 0;
    for (const p of mem) {
      const opt = p.options.find((o) => o.name === on);
      if (!opt) continue;
      const vs = new Set(p.variants.map((v) => v['option' + opt.position]).filter(Boolean));
      if (vs.size) withVal++;
      for (const v of vs) { if (!vals.has(v)) vals.set(v, []); vals.get(v).push(p.handle); }
    }
    const values = [...vals].filter(([v]) => !/^default title$/i.test(v)).map(([value, skus]) => ({ value, count: skus.length, skus }));
    if (!values.length) continue;
    facets.push({ node_id: n.node_id, facet: on, cross_cutting: /size|color|colour/i.test(on), null_rate: +(1 - withVal / mem.length).toFixed(3), values });
  }
}
const sibling_blocklist = [];
for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++)
  if (nodes[i].parent_id && nodes[i].parent_id === nodes[j].parent_id) sibling_blocklist.push([nodes[i].node_id, nodes[j].node_id]);
const skus = products.map((p) => ({ sku: p.handle, title: p.title, node_ids: nodeIds[p.handle] || [], attrs: { product_type: p.product_type || null, tags: p.tags, options: Object.fromEntries(p.options.filter((o) => o.name !== 'Title').map((o) => [o.name, [...new Set(p.variants.map((v) => v['option' + o.position]).filter(Boolean))]])), variant_skus: p.variants.map((v) => v.sku).filter(Boolean), min_price_present: !!p.variants.length, available: p.variants.some((v) => v.available) } }));
const inNode = skus.filter((s) => s.node_ids.length).length;
writeFileSync(join(dir, 'catalog.json'), JSON.stringify({
  catalog_version: '1', retailer: 'biggreenegg.com', eval_id: dir.split('/').pop(), captured_at: new Date().toISOString(),
  source: { method: 'catalog_api', base_url: 'https://biggreenegg.com', notes: 'Shopify /products.json (all 520 published products, 3 pages) + /collections/<handle>/products.json for 36 category collections (nodes). Paced >=1.1s/request, UA Northvalley-Ecommerce-Inspection/0.1. SKU id = product handle.' },
  facet_provenance: 'merchandiser', nodes, facets, sibling_blocklist, skus,
  limitations: [
    `Catalog = ${products.length} products from /products.json; ${inNode} sit in at least one captured category node, ${products.length - inNode} are in no captured node (events, services, gift/promo-only collections, uncategorised).`,
    'Nodes are the store\'s own category collections only; promo/seasonal/size-duplicate collections (e.g. "Holiday Gift Guide", "Large Egg Accessories") were deliberately not used as nodes because they overlap categories.',
    'Collection product lists from /collections/<h>/products.json list currently available/published items only, so node sku_count can be lower than the storefront products_count shown in /collections.json.',
    'Facets are limited to Shopify product options (Size/Color/etc.) set by merchandisers. EGG-size compatibility (Mini..2XL) is NOT a structured facet; it lives in titles/collections, so no size key was built on it.',
    'product_type is empty on 70 products and several tags are fulfilment-internal (e.g. "Small-From DC"), so they were not used as facets.'
  ]
}, null, 1));
console.log('nodes', nodes.length, 'facets', facets.length, 'skus', skus.length, 'in-node', inNode);
