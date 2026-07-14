import path from 'node:path';
import { appendJsonl, exists, readJsonl } from '../../lib/fs-json.mjs';
import { createRenderedSession } from '../../lib/rendered-evidence.mjs';

// Platform capability P008 applied to the search surface: observe what a
// customer actually sees for each query, retain screenshots, and compare the
// visible autocomplete dropdown against the endpoint evidence so reports can
// say "customers see X" instead of "the API returned X".

const RENDERED_QUERY_LIMIT = 5;

function searchUrl(primaryUrl, query) {
  const base = String(primaryUrl || '').replace(/\/+$/, '');
  return `${base}/search?q=${encodeURIComponent(query)}`;
}

export async function run(context) {
  const outputPath = path.join(context.outputDir, 'evidence', 'experiments', 'rendered-search.jsonl');
  const screenshotsDir = path.join(context.outputDir, 'evidence', 'screenshots');

  if (context.evaluation.rendering?.desktop !== true) {
    return {
      plugin_id: 'rendered-search',
      status: 'skipped',
      evidence_file: outputPath,
      observations: 0,
      completed_observations: 0,
      blocked_observations: 0,
      confidence: 'Unknown',
      evidence_quality: 'not_run',
      skip_reason: 'Rendering is not enabled in this evaluation manifest.',
      infrastructure_limitations: []
    };
  }

  const apiSuggestionsByQueryId = new Map();
  const autocompleteEvidencePath = path.join(context.outputDir, 'evidence', 'experiments', 'autocomplete.jsonl');
  if (exists(autocompleteEvidencePath)) {
    for (const row of readJsonl(autocompleteEvidencePath)) {
      // suggest.json evidence groups suggestions by resource type
      // ({products, collections, queries, pages}); flatten for comparison.
      const suggestions = row.observed?.suggestions;
      const flattened = Array.isArray(suggestions)
        ? suggestions
        : suggestions && typeof suggestions === 'object'
          ? Object.values(suggestions).flat()
          : [];
      apiSuggestionsByQueryId.set(row.query_id, flattened);
    }
  }

  const queries = context.queryRows.slice(0, RENDERED_QUERY_LIMIT);
  const rows = [];
  let session;
  try {
    session = await createRenderedSession({
      userAgent: context.target.inspection_defaults?.user_agent,
      timeoutMs: context.target.inspection_defaults?.timeout_ms ? context.target.inspection_defaults.timeout_ms + 10000 : undefined
    });
  } catch (error) {
    return {
      plugin_id: 'rendered-search',
      status: 'blocked',
      evidence_file: outputPath,
      observations: 0,
      completed_observations: 0,
      blocked_observations: 0,
      confidence: 'Low',
      evidence_quality: 'limitation_record',
      infrastructure_limitations: [
        {
          code: 'browser_unavailable',
          label: 'Headless browser could not be launched',
          status: null,
          endpoint: null,
          notes: String(error?.message || error).slice(0, 200)
        }
      ]
    };
  }

  try {
    for (const query of queries) {
      const pageCapture = await session.captureSearchPage(
        searchUrl(context.target.primary_url, query.query),
        path.join(screenshotsDir, `rendered-search-${query.query_id}.png`)
      );
      const dropdownCapture = await session.captureAutocomplete(
        context.target.primary_url,
        query.query,
        path.join(screenshotsDir, `rendered-autocomplete-${query.query_id}.png`)
      );

      const apiSuggestions = apiSuggestionsByQueryId.get(query.query_id) || [];
      const visibleSuggestions = dropdownCapture.observed?.visible_suggestions || [];
      const row = {
        schema_version: 'rendered-search-observation-v0.1',
        inspection_id: context.inspectionId,
        plugin_id: 'rendered-search',
        query_id: query.query_id,
        query: query.query,
        rendered_search: {
          endpoint: searchUrl(context.target.primary_url, query.query),
          final_url: pageCapture.final_url,
          status: pageCapture.status,
          ok: pageCapture.ok,
          duration_ms: pageCapture.duration_ms,
          classification: pageCapture.classification,
          screenshot: pageCapture.screenshot,
          observed: pageCapture.observed,
          error: pageCapture.error || null
        },
        rendered_autocomplete: {
          status: dropdownCapture.status,
          ok: dropdownCapture.ok,
          duration_ms: dropdownCapture.duration_ms,
          classification: dropdownCapture.classification,
          screenshot: dropdownCapture.screenshot,
          observed: dropdownCapture.observed,
          error: dropdownCapture.error || null
        },
        endpoint_comparison: {
          api_suggestion_count: apiSuggestions.length,
          visible_suggestion_count: visibleSuggestions.length,
          visible_dropdown_observed: visibleSuggestions.length > 0,
          note:
            visibleSuggestions.length > 0
              ? 'Visible dropdown suggestions were captured and can be compared against endpoint evidence.'
              : 'No visible dropdown suggestions were captured; endpoint evidence alone does not prove the customer-facing experience.'
        },
        confidence: pageCapture.ok && dropdownCapture.ok ? 'High' : pageCapture.ok || dropdownCapture.ok ? 'Medium' : 'Low',
        evidence_quality: pageCapture.ok ? 'rendered_browser_capture' : 'limitation_record',
        provenance: {
          source_query_pack: query.source_query_pack,
          source_query_id: query.query_id,
          capability_id: 'P008',
          run_at: new Date().toISOString()
        }
      };
      rows.push(row);
      appendJsonl(outputPath, row);
      context.timeline('plugin_observation_recorded', {
        plugin_id: 'rendered-search',
        query_id: query.query_id,
        rendered_ok: pageCapture.ok,
        visible_suggestions: visibleSuggestions.length
      });
    }
  } finally {
    await session.close();
  }

  const completed = rows.filter((row) => row.rendered_search.ok).length;
  const blocked = rows.length - completed;
  const limitations = rows.flatMap((row) =>
    [row.rendered_search, row.rendered_autocomplete]
      .filter((capture) => capture.classification?.category === 'infrastructure')
      .map((capture) => ({
        code: capture.classification.code,
        label: capture.classification.label,
        query_id: row.query_id,
        status: capture.status,
        endpoint: row.rendered_search.endpoint
      }))
  );

  return {
    plugin_id: 'rendered-search',
    status: completed > 0 ? (blocked > 0 || limitations.length > 0 ? 'warn' : 'pass') : 'blocked',
    evidence_file: outputPath,
    observations: rows.length,
    completed_observations: completed,
    blocked_observations: blocked,
    confidence: completed === rows.length && rows.length > 0 ? 'High' : completed > 0 ? 'Medium' : 'Low',
    evidence_quality: completed === rows.length && rows.length > 0 ? 'rendered' : 'partial',
    infrastructure_limitations: limitations
  };
}
