#!/usr/bin/env node

// WooCommerce inspection capture (GEN-028 slice 1).
//
// Runs a live, read-only inspection of a WooCommerce store via its public Store
// API: platform detection, catalog scale (SKUs / browse nodes / levels),
// submitted search (queries derived from the store's own top categories), and
// category browse. Writes honest evidence artifacts under the store's
// assessment directory. Not yet wired into the Shopify inspection-report schema
// or the dashboard site view - those are later WooCommerce slices.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createWooCommerceAdapter } from '../adapters/woocommerce.mjs';
import { targetIdFromDomain } from './onboard-target.mjs';

function domainOf(url) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'woo-target';
  }
}
function slugifyDomain(url) {
  return targetIdFromDomain(domainOf(url)) || 'woo-target';
}

// Register the store as a WooCommerce target so it shows up in the dashboard
// Sites list alongside Shopify targets. Idempotent: refreshes primary fields.
function writeWooTarget(rootDir, { targetId, name, url }) {
  const targetPath = path.join(rootDir, 'targets', `${targetId}.json`);
  const existing = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
  const manifest = {
    schema_version: 'target-manifest-v0.1',
    target_id: targetId,
    name,
    primary_url: url,
    domain: domainOf(url),
    platform: { expected: 'woocommerce', canonical_platform_host: null, confidence: 'observed', source: 'WooCommerce Store API reachable; detected via woo-inspect.' },
    inspection_defaults: { respect_robots: true, timeout_ms: 15000, user_agent: 'Northvalley-Ecommerce-Inspection/0.1' },
    known_limitations: existing.known_limitations || []
  };
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + '\n');
  return path.relative(rootDir, targetPath);
}

function discoverySignal({ sku_count, browse_levels, browse_nodes_substantive }) {
  const parts = [];
  if (sku_count == null) parts.push('SKU count unavailable from the Store API.');
  else if (sku_count < 200) parts.push(`Small catalog (${sku_count} SKUs): search is likely a lower priority; category/browse coverage matters more than deep search relevance.`);
  else if (sku_count < 1000) parts.push(`Mid-size catalog (${sku_count} SKUs): search starts to matter for findability.`);
  else parts.push(`Large catalog (${sku_count} SKUs): search and structured browse are both high-value.`);
  if (browse_levels <= 1) parts.push(`Flat browse (${browse_levels} level): no hierarchical navigation depth, so faceted/nested browse is not a strong signal here.`);
  else parts.push(`${browse_levels} browse levels: hierarchical navigation exists, so browse-node structure is worth inspecting.`);
  parts.push(`${browse_nodes_substantive} substantive browse nodes after filtering operational/merchandising categories.`);
  return parts.join(' ');
}

async function main() {
  const url = process.argv[2];
  const name = process.argv[3] || slugifyDomain(url || '');
  if (!url) {
    console.error('Usage: node src/evaluator/woo-inspect.mjs <site-url> [display name]');
    process.exit(1);
  }
  const rootDir = process.cwd();
  const targetId = slugifyDomain(url);
  const inspectionId = `WOO-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z')}`;
  const outputDir = path.join(rootDir, 'assessments', targetId, 'woo-inspection', inspectionId);
  fs.mkdirSync(path.join(outputDir, 'evidence'), { recursive: true });

  const adapter = createWooCommerceAdapter({ primary_url: url, name });
  const evidence = [];

  console.log(`WooCommerce inspection: ${name} (${url})`);
  const detection = await adapter.detectPlatform();
  evidence.push(...detection.evidence);
  console.log(`  platform: ${detection.platform} | store API reachable: ${detection.store_api_reachable} (status ${detection.store_api_status})`);
  if (detection.platform !== 'woocommerce') {
    console.error('  Not a WooCommerce store (or Store API blocked). Aborting.');
    process.exit(2);
  }
  const targetRel = writeWooTarget(rootDir, { targetId, name, url });
  console.log(`  registered target: ${targetRel}`);

  const catalog = await adapter.discoverCatalog();
  evidence.push(...catalog.evidence);
  console.log(`  SKUs: ${catalog.sku_count} | browse nodes: ${catalog.browse_nodes} (${catalog.browse_nodes_substantive} substantive) | levels: ${catalog.browse_levels}`);

  // Build a query set that surfaces search quality both ways:
  //  - "literal" queries taken from actual product names (native search should hit these)
  //  - "intent" queries taken from the store's own category names (tests whether
  //    search understands category/intent terms, not just literal product tokens)
  const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'your', 'plus', 'all', 'new', 'pack', 'size', 'flavor']);
  const sample = await adapter.fetchProductSample(15);
  evidence.push(sample.evidence);
  const literalTerms = [];
  for (const product of sample.products) {
    const token = String(product.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).find((word) => word.length > 3 && !STOPWORDS.has(word));
    if (token && !literalTerms.includes(token)) literalTerms.push(token);
    if (literalTerms.length >= 4) break;
  }
  const intentTerms = catalog.categories
    .filter((category) => !/\b(available on|back in stock|promo|uncategor|on sale|^new$|featured|bundle|stack)/i.test(category.name))
    .sort((left, right) => (right.count || 0) - (left.count || 0))
    .slice(0, 4)
    .map((category) => category.name);
  const queries = [
    ...literalTerms.map((term) => ({ query: term, kind: 'literal (from product names)' })),
    ...intentTerms.map((term) => ({ query: term, kind: 'intent (from category names)' }))
  ];

  const searchProbe = [];
  for (const { query, kind } of queries) {
    const result = await adapter.fetchSubmittedSearch(query);
    evidence.push(result.evidence);
    searchProbe.push({ query: result.query, kind, result_count: result.result_count, returned: result.returned, status: result.status, top: result.results.slice(0, 5) });
    console.log(`  search "${query}" [${kind}] -> ${result.result_count} results (status ${result.status})`);
  }
  const literalHits = searchProbe.filter((row) => row.kind.startsWith('literal') && row.result_count > 0).length;
  const intentHits = searchProbe.filter((row) => row.kind.startsWith('intent') && row.result_count > 0).length;
  const literalTotal = searchProbe.filter((row) => row.kind.startsWith('literal')).length;
  const intentTotal = searchProbe.filter((row) => row.kind.startsWith('intent')).length;

  const summary = {
    schema_version: 'woo-catalog-summary-v0.1',
    inspection_id: inspectionId,
    target_id: targetId,
    name,
    url,
    captured_at: new Date().toISOString(),
    platform: detection.platform,
    store_api: adapter.storeApi,
    sku_count: catalog.sku_count,
    sku_count_source: catalog.sku_count_source,
    browse_nodes: catalog.browse_nodes,
    browse_nodes_substantive: catalog.browse_nodes_substantive,
    browse_nodes_operational_heuristic: catalog.browse_nodes_operational_heuristic,
    browse_levels: catalog.browse_levels,
    top_level_nodes: catalog.top_level_nodes,
    top_categories: catalog.categories.slice().sort((left, right) => (right.count || 0) - (left.count || 0)).slice(0, 10).map((category) => ({ name: category.name, count: category.count })),
    search_queries_run: queries.length,
    search_signal: {
      literal_hits: `${literalHits}/${literalTotal}`,
      intent_hits: `${intentHits}/${intentTotal}`,
      note: intentTotal > 0 && intentHits < intentTotal
        ? 'Native search returns products for literal product-name terms but misses category/intent queries — a search-relevance gap (e.g. synonyms/intent not understood).'
        : 'Native search handled both literal and intent queries in this sample.'
    },
    discovery_signal: discoverySignal(catalog)
  };

  writeJson(path.join(outputDir, 'catalog-summary.json'), summary);
  writeJsonl(path.join(outputDir, 'evidence', 'search-probe.jsonl'), searchProbe);
  writeJsonl(path.join(outputDir, 'evidence', 'browse-nodes.jsonl'), catalog.categories);
  writeJson(path.join(outputDir, 'run-manifest.json'), {
    inspection_id: inspectionId,
    adapter: { adapter_id: adapter.adapter_id, adapter_version: adapter.adapter_version },
    target: { target_id: targetId, name, url },
    platform: detection.platform,
    started_at: summary.captured_at,
    endpoints: evidence
  });

  console.log(`\n  Catalog summary written: ${path.relative(rootDir, path.join(outputDir, 'catalog-summary.json'))}`);
  console.log(`  Signal: ${summary.discovery_signal}`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}
function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
}

export { discoverySignal, slugifyDomain };
