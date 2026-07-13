import path from 'node:path';
import { appendJsonl } from '../../lib/fs-json.mjs';

function extractSuggestions(json) {
  const results = json?.resources?.results || {};
  return {
    products: (results.products || []).map((item) => ({
      id: item.id || null,
      title: item.title || null,
      url: item.url || null
    })),
    collections: (results.collections || []).map((item) => ({
      id: item.id || null,
      title: item.title || null,
      url: item.url || null
    })),
    queries: (results.queries || []).map((item) => ({
      text: item.text || item.title || null,
      url: item.url || null
    })),
    pages: (results.pages || []).map((item) => ({
      id: item.id || null,
      title: item.title || null,
      url: item.url || null
    }))
  };
}

function countSuggestions(suggestions) {
  return Object.values(suggestions).reduce((sum, values) => sum + values.length, 0);
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'autocomplete.jsonl');
  const rows = [];

  for (const query of context.queryRows) {
    const evidence = await context.adapter.fetchAutocomplete(query.query);
    const suggestions = extractSuggestions(evidence.json);
    const suggestionCount = countSuggestions(suggestions);
    const row = {
      schema_version: 'autocomplete-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'autocomplete',
      query_id: query.query_id,
      typed_prefix: query.query,
      endpoint: evidence.url,
      final_url: evidence.final_url,
      status: evidence.status,
      duration_ms: evidence.duration_ms,
      ok: evidence.ok,
      classification: evidence.classification,
      confidence: evidence.ok && suggestionCount > 0 ? 'Medium' : evidence.classification ? 'High' : 'Low',
      evidence_quality: evidence.ok ? 'api_response' : 'limitation_record',
      observed: {
        suggestion_count: suggestionCount,
        suggestions,
        response_excerpt: evidence.text_excerpt
      },
      provenance: {
        source_query_pack: query.source_query_pack,
        source_query_id: query.query_id,
        run_at: new Date().toISOString()
      }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
    context.timeline('plugin_observation_recorded', {
      plugin_id: 'autocomplete',
      query_id: query.query_id,
      status: evidence.status,
      suggestion_count: suggestionCount,
      classification: evidence.classification?.code || null
    });
  }

  const blocked = rows.filter((row) => row.classification).length;
  const rowsWithSuggestions = rows.filter((row) => row.observed.suggestion_count > 0).length;
  return {
    plugin_id: 'autocomplete',
    status: rowsWithSuggestions > 0 ? (blocked > 0 ? 'warn' : 'pass') : blocked === rows.length ? 'blocked' : 'warn',
    evidence_file: outputPath,
    observations: rows.length,
    observations_with_suggestions: rowsWithSuggestions,
    blocked_observations: blocked,
    confidence: rowsWithSuggestions > 0 ? 'Medium' : 'Low',
    evidence_quality: rowsWithSuggestions === rows.length ? 'bounded' : 'partial',
    infrastructure_limitations: rows
      .filter((row) => row.classification?.category === 'infrastructure')
      .map((row) => ({
        code: row.classification.code,
        label: row.classification.label,
        query_id: row.query_id,
        status: row.status,
        endpoint: row.endpoint
      }))
  };
}
