import path from 'node:path';
import { appendJsonl } from '../../lib/fs-json.mjs';

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'recommendations.jsonl');
  const rows = [];

  const products = await context.adapter.fetchProducts(3);
  const sampled = (products.json?.products || [])
    .map((product) => ({ id: product.id, title: product.title || null }))
    .filter((product) => product.id)
    .slice(0, 3);

  if (sampled.length === 0) {
    const row = {
      schema_version: 'recommendations-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'recommendations',
      observation: 'product_sampling',
      endpoint: products.url,
      status: products.status,
      duration_ms: products.duration_ms,
      ok: products.ok,
      classification: products.classification,
      confidence: 'Low',
      evidence_quality: products.classification ? 'limitation_record' : 'bounded_json_response',
      observed: { note: 'No public product IDs were available to probe the recommendations endpoint.' },
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
  }

  for (const product of sampled) {
    const evidence = await context.adapter.fetchRecommendations(product.id, 8);
    const recommended = Array.isArray(evidence.json?.products) ? evidence.json.products : [];
    const row = {
      schema_version: 'recommendations-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'recommendations',
      observation: 'product_recommendations_endpoint',
      source_product_id: product.id,
      source_product_title: product.title,
      endpoint: evidence.url,
      final_url: evidence.final_url,
      status: evidence.status,
      duration_ms: evidence.duration_ms,
      ok: evidence.ok,
      classification: evidence.classification,
      confidence: evidence.ok ? 'Medium' : 'Low',
      evidence_quality: evidence.ok ? 'bounded_json_response' : 'limitation_record',
      observed: {
        recommended_product_count: recommended.length,
        recommended_titles: recommended.slice(0, 8).map((item) => item.title || null)
      },
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
    context.timeline('plugin_observation_recorded', {
      plugin_id: 'recommendations',
      source_product_id: product.id,
      status: evidence.status,
      recommended_product_count: recommended.length
    });
  }

  const blocked = rows.filter((row) => row.classification).length;
  const completed = rows.length - blocked;
  return {
    plugin_id: 'recommendations',
    status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : 'blocked',
    evidence_file: outputPath,
    observations: rows.length,
    completed_observations: completed,
    blocked_observations: blocked,
    confidence: completed > 0 ? 'Medium' : 'Low',
    evidence_quality: completed === rows.length && rows.length > 0 ? 'bounded' : 'partial',
    infrastructure_limitations: rows
      .filter((row) => row.classification?.category === 'infrastructure')
      .map((row) => ({
        code: row.classification.code,
        label: row.classification.label,
        status: row.status,
        endpoint: row.endpoint
      }))
  };
}
