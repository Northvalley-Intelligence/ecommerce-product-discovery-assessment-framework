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

// Present the WooCommerce discovery surfaces the same way the Shopify view
// does: one entry per surface with a status (pass / warn / limited) and an
// honest signal. Recommendations is a capture limitation, not a store finding.
function buildSurfaces({ catalog, facets, literalHits, literalTotal, intentHits, intentTotal }) {
  const facetRich = facets.filterable_count >= 3 && facets.top_facets.some((f) => f.term_count >= 5);
  const intentMiss = intentTotal > 0 && intentHits < intentTotal;
  return [
    { surface: 'Catalog', status: 'pass', nature: 'store_finding', detail: `${catalog.sku_count} SKUs across ${catalog.browse_nodes} browse nodes (${catalog.browse_nodes_substantive} substantive), ${catalog.browse_levels} level.` },
    { surface: 'Search', status: intentMiss ? 'warn' : 'pass', nature: 'store_finding', detail: `Literal ${literalHits}/${literalTotal}, intent ${intentHits}/${intentTotal}.` + (intentMiss ? ' Intent/category queries return nothing — relevance gap.' : '') },
    { surface: 'Autocomplete', status: 'pass', nature: 'store_finding', detail: 'Type-ahead available via prefix product search (no native WooCommerce autocomplete endpoint).' },
    { surface: 'Facets', status: facetRich ? 'pass' : 'warn', nature: 'store_finding', detail: `${facets.attribute_count} attributes, ${facets.filterable_count} filterable; top facet ${facets.top_facets[0] ? facets.top_facets[0].name + ' (' + facets.top_facets[0].term_count + ' terms)' : 'none'}. ${facets.products_with_attributes}/${facets.sample_size} sampled products carry attributes.` },
    { surface: 'Recommendations', status: 'limited', nature: 'capture_limitation', detail: 'Not exposed via the WooCommerce Store API (related/upsell products are rendered server-side). Needs rendered capture to inspect.' },
    { surface: 'Browse', status: catalog.browse_levels > 1 ? 'pass' : 'warn', nature: 'store_finding', detail: `${catalog.browse_nodes} category nodes, ${catalog.browse_levels === 1 ? 'flat (no hierarchy)' : catalog.browse_levels + ' levels'}.` }
  ];
}

// Health rollup derived from the discovery surfaces, mirroring the Shopify
// site view's readiness/coverage. Capture limitations (e.g. Recommendations)
// are excluded from the pass-rate denominator - they are not store failures.
function buildHealth(surfaces) {
  const inspectable = surfaces.filter((s) => s.nature === 'store_finding');
  const passed = inspectable.filter((s) => s.status === 'pass').length;
  const warned = inspectable.filter((s) => s.status === 'warn').length;
  const failed = inspectable.filter((s) => s.status === 'fail').length;
  const limited = surfaces.filter((s) => s.nature === 'capture_limitation').length;
  const coverage = inspectable.length ? Math.round((passed / inspectable.length) * 100) : 0;
  const readiness = failed > 0 ? 'not_ready' : warned > 0 ? 'bounded' : 'ready';
  return {
    coverage_percent: coverage,
    readiness,
    status: warned > 0 || failed > 0 ? 'partial' : 'complete',
    surfaces_total: surfaces.length,
    surfaces_pass: passed,
    surfaces_warn: warned,
    surfaces_fail: failed,
    surfaces_limited: limited
  };
}

// Findings derived from warn/fail/limited surfaces. store_finding warnings are
// the store's discovery issues; capture_limitation entries are our tooling limits.
function buildFindings(surfaces, searchSignal) {
  const findings = [];
  let n = 0;
  const sev = { Search: 'High', Browse: 'Medium', Facets: 'Medium', Catalog: 'Medium', Autocomplete: 'Low' };
  for (const surface of surfaces) {
    if (surface.status === 'pass') continue;
    n += 1;
    findings.push({
      id: `WOO-F${String(n).padStart(3, '0')}`,
      surface: surface.surface,
      severity: surface.nature === 'capture_limitation' ? 'Info' : (sev[surface.surface] || 'Medium'),
      nature: surface.nature,
      title: surface.nature === 'capture_limitation'
        ? `${surface.surface} not inspectable via the Store API`
        : `${surface.surface}: ${surface.status === 'warn' ? 'discovery gap' : 'failure'}`,
      detail: surface.detail
    });
  }
  return findings;
}

// Fix plan: only store findings become fix items (capture limitations are ours).
function buildFixPlan(findings) {
  const RECS = {
    Search: 'Add synonym/intent handling (or a search app) so category and concept queries ("sofa", "seating") return products, not just literal product names.',
    Browse: 'Introduce a hierarchical category structure (parent/child) so shoppers can drill down instead of scanning a flat list.',
    Facets: 'Expose more filterable attributes as on-page facets so shoppers can refine large result sets.',
    Autocomplete: 'Add a real autocomplete/suggest experience rather than relying on prefix product search.'
  };
  const items = findings.filter((f) => f.nature === 'store_finding').map((f) => ({
    id: f.id.replace('WOO-F', 'WOO-FIX'),
    surface: f.surface,
    severity: f.severity,
    issue: f.detail,
    recommendation: RECS[f.surface] || 'Review this surface for discovery improvements.',
    status: 'open'
  }));
  return { open_items: items.length, items };
}

function buildExecutiveReport(summary) {
  const h = summary.health;
  const lines = [];
  lines.push(`# Ecommerce Discovery Evaluation: ${summary.name}`);
  lines.push('');
  lines.push(`**Store:** ${summary.url}  `);
  lines.push(`**Platform:** WooCommerce  `);
  lines.push(`**Evaluated:** ${summary.captured_at}  `);
  lines.push(`**Readiness:** ${h.readiness} · **Surface coverage:** ${h.coverage_percent}% (${h.surfaces_pass} pass · ${h.surfaces_warn} warn · ${h.surfaces_limited} not inspectable)`);
  lines.push('');
  lines.push('## Catalog');
  lines.push(`- **${summary.sku_count} SKUs** across **${summary.browse_nodes} browse nodes** (${summary.browse_nodes_substantive} substantive), **${summary.browse_levels} level** (${summary.browse_levels <= 1 ? 'flat' : 'hierarchical'}).`);
  lines.push(`- **${summary.facets.attribute_count} product attributes** (${summary.facets.filterable_count} filterable). Top facet: ${summary.facets.top_facets[0] ? summary.facets.top_facets[0].name + ' (' + summary.facets.top_facets[0].term_count + ' terms)' : 'none'}.`);
  lines.push('');
  lines.push('## Discovery surfaces');
  for (const s of summary.surfaces) lines.push(`- **${s.surface}** — ${s.status.toUpperCase()}${s.nature === 'capture_limitation' ? ' (capture limitation)' : ''}: ${s.detail}`);
  lines.push('');
  lines.push('## Findings');
  if (summary.findings.length === 0) lines.push('- No discovery gaps found.');
  for (const f of summary.findings) lines.push(`- **[${f.severity}] ${f.title}** — ${f.detail}`);
  lines.push('');
  lines.push('## Recommended fixes');
  if (summary.fix_plan.items.length === 0) lines.push('- None.');
  for (const item of summary.fix_plan.items) lines.push(`- **${item.surface}** (${item.severity}): ${item.recommendation}`);
  lines.push('');
  lines.push(`*${summary.discovery_signal}*`);
  lines.push('');
  lines.push('_Note: Recommendations and rendered UI are not exposed by the WooCommerce Store API; rendered (browser) capture is a pending inspection slice._');
  return lines.join('\n') + '\n';
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

  const facets = await adapter.discoverFacets();
  evidence.push(...facets.evidence);
  console.log(`  facets: ${facets.attribute_count} attributes (${facets.filterable_count} filterable) · top: ${facets.top_facets.slice(0, 3).map((f) => f.name + '(' + f.term_count + ')').join(', ')}`);

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
    facets: {
      attribute_count: facets.attribute_count,
      filterable_count: facets.filterable_count,
      top_facets: facets.top_facets,
      products_with_attributes: facets.products_with_attributes,
      variable_products: facets.variable_products,
      sample_size: facets.sample_size
    },
    surfaces: buildSurfaces({ catalog, facets, literalHits, literalTotal, intentHits, intentTotal }),
    discovery_signal: discoverySignal(catalog)
  };
  // Shopify-parity deliverables derived from the captured surfaces.
  summary.health = buildHealth(summary.surfaces);
  summary.findings = buildFindings(summary.surfaces, summary.search_signal);
  summary.fix_plan = buildFixPlan(summary.findings);
  const executiveMarkdown = buildExecutiveReport(summary);
  writeJson(path.join(outputDir, 'executive-report.json'), { summary_ref: 'catalog-summary.json', health: summary.health, findings: summary.findings, fix_plan: summary.fix_plan });
  fs.writeFileSync(path.join(outputDir, 'executive-report.md'), executiveMarkdown);
  summary.report_md_path = path.relative(rootDir, path.join(outputDir, 'executive-report.md'));
  console.log(`  health: readiness ${summary.health.readiness} · coverage ${summary.health.coverage_percent}% · findings ${summary.findings.length} · fixes ${summary.fix_plan.open_items}`);

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
