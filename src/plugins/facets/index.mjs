import path from 'node:path';
import { appendJsonl } from '../../lib/fs-json.mjs';

const FACET_MARKERS = [
  'filter.v.',
  'filter.p.',
  'collectionfiltersform',
  'facetfiltersform',
  'data-filter',
  'facet-filters'
];

function detectFacetMarkers(html) {
  const lower = String(html || '').toLowerCase();
  return FACET_MARKERS.filter((marker) => lower.includes(marker));
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'facets.jsonl');
  const rows = [];

  const collections = await context.adapter.fetchCollections(5);
  const handles = (collections.json?.collections || [])
    .map((collection) => collection.handle)
    .filter(Boolean)
    .slice(0, 2);

  if (collections.classification) {
    const row = {
      schema_version: 'facet-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'facets',
      observation: 'collections_listing',
      endpoint: collections.url,
      status: collections.status,
      duration_ms: collections.duration_ms,
      ok: collections.ok,
      classification: collections.classification,
      confidence: 'Low',
      evidence_quality: 'limitation_record',
      observed: {},
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
  }

  for (const handle of handles) {
    const evidence = await context.adapter.fetchCollectionPage(handle);
    const markers = evidence.ok ? detectFacetMarkers(evidence.text_excerpt) : [];
    const row = {
      schema_version: 'facet-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'facets',
      observation: 'collection_page_facet_markup',
      collection_handle: handle,
      endpoint: evidence.url,
      final_url: evidence.final_url,
      status: evidence.status,
      duration_ms: evidence.duration_ms,
      ok: evidence.ok,
      classification: evidence.classification,
      confidence: evidence.ok ? 'Medium' : 'Low',
      evidence_quality: evidence.ok ? 'bounded_html_response' : 'limitation_record',
      observed: {
        facet_markers_found: markers,
        facet_markup_present: markers.length > 0,
        content_type: evidence.content_type
      },
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
    context.timeline('plugin_observation_recorded', {
      plugin_id: 'facets',
      collection_handle: handle,
      status: evidence.status,
      facet_markup_present: markers.length > 0
    });
  }

  if (handles.length === 0 && !collections.classification) {
    const row = {
      schema_version: 'facet-observation-v0.1',
      inspection_id: context.inspectionId,
      plugin_id: 'facets',
      observation: 'collections_listing',
      endpoint: collections.url,
      status: collections.status,
      ok: collections.ok,
      classification: null,
      confidence: 'Low',
      evidence_quality: 'bounded_json_response',
      observed: { note: 'Collections listing returned no public collection handles to probe.' },
      provenance: { run_at: new Date().toISOString() }
    };
    rows.push(row);
    appendJsonl(outputPath, row);
  }

  const blocked = rows.filter((row) => row.classification).length;
  const completed = rows.length - blocked;
  return {
    plugin_id: 'facets',
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
