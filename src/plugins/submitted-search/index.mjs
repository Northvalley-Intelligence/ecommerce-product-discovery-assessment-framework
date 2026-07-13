import path from 'node:path';
import { appendJsonl } from '../../lib/fs-json.mjs';

function confidenceForResponse(evidence) {
  if (evidence.status && evidence.classification) return 'High';
  if (evidence.ok) return 'Medium';
  return 'Low';
}

function extractResultCountHint(htmlExcerpt) {
  const match = String(htmlExcerpt || '').match(/([\d,]+)\s+results?\s+found/i);
  if (!match) return null;
  const count = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(count) ? count : null;
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'submitted-search.jsonl');
  const rows = [];

  for (const query of context.queryRows) {
    const evidence = await context.adapter.fetchSubmittedSearch(query.query);
    const row = {
      schema_version: 'submitted-search-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'submitted-search',
      query_id: query.query_id,
      query: query.query,
      expected_relationships: query.expected_relationships || [],
      endpoint: evidence.url,
      final_url: evidence.final_url,
      status: evidence.status,
      duration_ms: evidence.duration_ms,
      ok: evidence.ok,
      classification: evidence.classification,
      confidence: confidenceForResponse(evidence),
      evidence_quality: evidence.ok ? 'bounded_html_response' : 'limitation_record',
      observed: {
        html_excerpt: evidence.text_excerpt,
        content_type: evidence.content_type,
        result_count_hint: extractResultCountHint(evidence.text_excerpt)
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
      plugin_id: 'submitted-search',
      query_id: query.query_id,
      status: evidence.status,
      classification: evidence.classification?.code || null
    });
  }

  const blocked = rows.filter((row) => row.classification).length;
  const completed = rows.length - blocked;
  return {
    plugin_id: 'submitted-search',
    status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : 'blocked',
    evidence_file: outputPath,
    observations: rows.length,
    completed_observations: completed,
    blocked_observations: blocked,
    confidence: completed > 0 ? 'Medium' : 'Low',
    evidence_quality: completed === rows.length ? 'bounded' : 'partial',
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
