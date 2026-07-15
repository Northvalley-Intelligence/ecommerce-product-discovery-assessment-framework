import path from 'node:path';
import { appendJsonl, writeJson } from '../../lib/fs-json.mjs';

// Browse inventory (GEN-018 option a): for each observed collection, record its
// product count and a membership sample from the public per-collection products
// endpoint. This yields the browse graph's NODES and membership; the
// hierarchical parent/child tree (from the storefront nav) is a future slice.

const COLLECTION_LIMIT = 8;
const MEMBERSHIP_SAMPLE = 20;

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'browse-graph.jsonl');
  const graphPath = path.join(context.outputDir, 'evidence', 'browse-graph.json');

  // Skip promo/operational collections the way curation does, so the browse
  // inventory reflects customer-facing categories.
  const OPERATIONAL = /[%$,]|\b(sale|clearance|off|preview|tier|msrp|price|discount|protection|package|wholesale|content|all[- ]?products?|final)s?\b|\b20\d\d\b/i;
  const collections = (context.siteProfile.catalog_discovery?.collections || [])
    .filter((collection) => collection.handle && collection.title && !OPERATIONAL.test(collection.title))
    .sort((left, right) => (right.products_count || 0) - (left.products_count || 0))
    .slice(0, COLLECTION_LIMIT);

  if (collections.length === 0) {
    const row = {
      schema_version: 'browse-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'browse-graph',
      observation: 'no_browsable_collections',
      ok: false,
      classification: { category: 'infrastructure', code: 'no_collections', label: 'No browsable collections were discovered' },
      confidence: 'Low',
      evidence_quality: 'limitation_record',
      provenance: { run_at: new Date().toISOString() }
    };
    appendJsonl(outputPath, row);
    return {
      plugin_id: 'browse-graph',
      status: 'blocked',
      evidence_file: outputPath,
      observations: 1,
      completed_observations: 0,
      blocked_observations: 1,
      confidence: 'Low',
      evidence_quality: 'limitation_record',
      infrastructure_limitations: [{ code: 'no_collections', label: 'No browsable collections were discovered', status: null, endpoint: null }]
    };
  }

  const rows = [];
  const nodes = [];
  for (const collection of collections) {
    const evidence = await context.adapter.fetchCollectionProducts(collection.handle, MEMBERSHIP_SAMPLE);
    const products = Array.isArray(evidence.json?.products) ? evidence.json.products : [];
    const sample = products.slice(0, MEMBERSHIP_SAMPLE).map((product) => ({ handle: product.handle, title: product.title || null }));
    const row = {
      schema_version: 'browse-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'browse-graph',
      observation: 'collection_membership',
      collection_handle: collection.handle,
      collection_title: collection.title,
      declared_product_count: collection.products_count ?? null,
      endpoint: evidence.url,
      final_url: evidence.final_url,
      status: evidence.status,
      ok: evidence.ok,
      duration_ms: evidence.duration_ms,
      classification: evidence.classification,
      observed: {
        sampled_product_count: sample.length,
        sample_products: sample
      },
      confidence: evidence.ok ? 'Medium' : 'Low',
      evidence_quality: evidence.ok ? 'bounded_json_response' : 'limitation_record',
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
    if (evidence.ok) {
      nodes.push({
        handle: collection.handle,
        title: collection.title,
        declared_product_count: collection.products_count ?? null,
        sampled_product_count: sample.length,
        sample_products: sample.map((product) => product.handle).filter(Boolean)
      });
    }
    context.timeline('plugin_observation_recorded', {
      plugin_id: 'browse-graph',
      collection_handle: collection.handle,
      status: evidence.status,
      sampled_product_count: sample.length
    });
  }

  // The browse graph artifact: nodes + membership. Hierarchy is intentionally
  // flat in this slice (option a); parent/child edges await nav extraction.
  writeJson(graphPath, {
    schema_version: 'browse-graph-v0.1',
    inspection_id: context.inspectionId,
    generated_at: new Date().toISOString(),
    hierarchy: 'flat_inventory',
    hierarchy_note: 'Nodes and membership only; parent/child tree from the storefront navigation is a future slice.',
    node_count: nodes.length,
    nodes
  });

  const completed = rows.filter((row) => row.ok).length;
  const blocked = rows.length - completed;
  return {
    plugin_id: 'browse-graph',
    status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : 'blocked',
    evidence_file: outputPath,
    observations: rows.length,
    completed_observations: completed,
    blocked_observations: blocked,
    browse_graph_file: path.relative(context.outputDir, graphPath),
    confidence: completed === rows.length && rows.length > 0 ? 'Medium' : completed > 0 ? 'Medium' : 'Low',
    evidence_quality: completed === rows.length && rows.length > 0 ? 'bounded' : 'partial',
    infrastructure_limitations: rows
      .filter((row) => row.classification?.category === 'infrastructure')
      .map((row) => ({ code: row.classification.code, label: row.classification.label, query_id: row.collection_handle, status: row.status, endpoint: row.endpoint }))
  };
}
