import path from 'node:path';
import { appendJsonl } from '../../lib/fs-json.mjs';

function observeMobileHtml(html) {
  const lower = String(html || '').toLowerCase();
  return {
    viewport_meta_present: lower.includes('name="viewport"') || lower.includes("name='viewport'"),
    responsive_meta_width: lower.includes('width=device-width')
  };
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'mobile.jsonl');
  const rows = [];

  const firstQuery = context.queryRows[0];
  const probes = [
    { probe_id: 'mobile-homepage', suffix: '/' },
    firstQuery
      ? {
          probe_id: 'mobile-search',
          suffix: `/search?${new URLSearchParams({ q: firstQuery.query }).toString()}`,
          query_id: firstQuery.query_id
        }
      : null
  ].filter(Boolean);

  for (const probe of probes) {
    const evidence = await context.adapter.fetchMobilePage(probe.suffix);
    const row = {
      schema_version: 'mobile-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'mobile',
      probe_id: probe.probe_id,
      query_id: probe.query_id || null,
      endpoint: evidence.url,
      final_url: evidence.final_url,
      status: evidence.status,
      duration_ms: evidence.duration_ms,
      ok: evidence.ok,
      classification: evidence.classification,
      confidence: evidence.ok ? 'Medium' : 'Low',
      evidence_quality: evidence.ok ? 'bounded_html_response_mobile_ua' : 'limitation_record',
      observed: {
        ...(evidence.ok ? observeMobileHtml(evidence.text_excerpt) : {}),
        content_type: evidence.content_type,
        evidence_scope: 'HTTP response with mobile user agent only; no rendered mobile capture.'
      },
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
    context.timeline('plugin_observation_recorded', {
      plugin_id: 'mobile',
      probe_id: probe.probe_id,
      status: evidence.status
    });
  }

  const blocked = rows.filter((row) => row.classification).length;
  const completed = rows.length - blocked;
  return {
    plugin_id: 'mobile',
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
