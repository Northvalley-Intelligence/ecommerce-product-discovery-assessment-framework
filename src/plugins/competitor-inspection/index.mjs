import path from 'node:path';
import { appendJsonl, readJson } from '../../lib/fs-json.mjs';
import { createShopifyAdapter } from '../../adapters/shopify.mjs';

function countSuggestions(json) {
  const results = json?.resources?.results || {};
  return Object.values(results).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0);
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'competitor-inspection.jsonl');
  const rows = [];

  const competitorPaths = context.evaluation.competitors || [];
  if (competitorPaths.length === 0) {
    return {
      plugin_id: 'competitor-inspection',
      status: 'skipped',
      evidence_file: outputPath,
      observations: 0,
      completed_observations: 0,
      blocked_observations: 0,
      confidence: 'Unknown',
      evidence_quality: 'not_applicable',
      notes: 'No peer targets are listed in this evaluation manifest.',
      infrastructure_limitations: []
    };
  }

  const sameQueries = context.queryRows.slice(0, 3);

  for (const competitorPath of competitorPaths) {
    const competitorTarget = readJson(competitorPath);
    const adapter = createShopifyAdapter(competitorTarget);

    for (const query of sameQueries) {
      const search = await adapter.fetchSubmittedSearch(query.query);
      const suggest = await adapter.fetchAutocomplete(query.query);

      for (const [surface, evidence] of [
        ['submitted_search', search],
        ['autocomplete', suggest]
      ]) {
        const row = {
          schema_version: 'competitor-same-query-observation-v0.1',
          inspection_id: context.inspectionId,
          plugin_id: 'competitor-inspection',
          peer_target_id: competitorTarget.target_id,
          peer_name: competitorTarget.name,
          surface,
          query_id: query.query_id,
          query: query.query,
          endpoint: evidence.url,
          final_url: evidence.final_url,
          status: evidence.status,
          duration_ms: evidence.duration_ms,
          ok: evidence.ok,
          classification: evidence.classification,
          confidence: evidence.ok ? 'Medium' : 'Low',
          evidence_quality: evidence.ok
            ? surface === 'autocomplete'
              ? 'bounded_json_response'
              : 'bounded_html_response'
            : 'limitation_record',
          observed:
            surface === 'autocomplete'
              ? { suggestion_count: countSuggestions(evidence.json) }
              : { content_type: evidence.content_type },
          observational_rule: 'Same-query peer evidence is observational; comparative framing is downstream.',
          provenance: {
            peer_target_manifest: competitorPath,
            source_query_pack: query.source_query_pack,
            source_query_id: query.query_id,
            run_at: new Date().toISOString()
          }
        };
        rows.push(row);
        appendJsonl(outputPath, row);
        context.timeline('plugin_observation_recorded', {
          plugin_id: 'competitor-inspection',
          peer_target_id: competitorTarget.target_id,
          surface,
          query_id: query.query_id,
          status: evidence.status
        });
      }
    }
  }

  const blocked = rows.filter((row) => row.classification).length;
  const completed = rows.length - blocked;
  return {
    plugin_id: 'competitor-inspection',
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
        peer_target_id: row.peer_target_id,
        status: row.status,
        endpoint: row.endpoint
      }))
  };
}
