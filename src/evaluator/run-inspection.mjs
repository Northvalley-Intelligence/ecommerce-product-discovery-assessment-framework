#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyAdapter } from '../adapters/shopify.mjs';
import {
  appendJsonl,
  ensureDir,
  exists,
  listFilesRecursive,
  readJson,
  readJsonl,
  writeJson,
  writeText
} from '../lib/fs-json.mjs';
import { createInspectionId, slugify } from '../lib/ids.mjs';
import { runPlatformValidation } from '../platform/platform-validation.mjs';
import { buildDashboardHtml } from './dashboard-html.mjs';
import { buildPluginGraph, loadPlugin } from './plugin-loader.mjs';

function parseArgs(argv) {
  const args = {
    evaluation: null,
    only: null,
    resume: null,
    simulateInterruptAfter: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--evaluation') {
      args.evaluation = argv[index + 1];
      index += 1;
    } else if (value === '--only') {
      args.only = argv[index + 1].split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (value === '--resume') {
      args.resume = argv[index + 1];
      index += 1;
    } else if (value === '--simulate-interrupt-after') {
      args.simulateInterruptAfter = argv[index + 1];
      index += 1;
    } else if (!args.evaluation) {
      args.evaluation = value;
    }
  }
  if (!args.evaluation && !args.resume) {
    throw new Error('Usage: node src/evaluator/run-inspection.mjs --evaluation evaluations/ridge-shopify-baseline.json');
  }
  return args;
}

function collectQueryRows(queryPacks) {
  return queryPacks.flatMap((pack) =>
    (pack.queries || []).map((query) => ({
      ...query,
      source_query_pack: pack.query_pack_id
    }))
  );
}

function writeDatasets({ outputDir, inspectionId, queryPacks, queryRows }) {
  const datasetDir = path.join(outputDir, 'evidence', 'datasets');
  ensureDir(datasetDir);

  const ds1 = queryRows.map((query) => ({
    schema_version: 'ds1-canonical-search-v0.1',
    inspection_id: inspectionId,
    dataset_id: 'DS1',
    query_id: query.query_id,
    query: query.query,
    relationships: query.expected_relationships || [],
    provenance: {
      source_query_pack: query.source_query_pack,
      source_query_id: query.query_id,
      source_reason: query.provenance?.reason || null
    }
  }));

  const ds2 = queryRows.flatMap((query) => {
    const variants = [];
    if (!query.query.endsWith('s')) {
      variants.push({
        variation_type: 'plural',
        generated_query: `${query.query}s`
      });
    }
    if (query.query.includes(' ')) {
      variants.push({
        variation_type: 'delimiter_hyphen',
        generated_query: query.query.replace(/\s+/g, '-')
      });
      variants.push({
        variation_type: 'missing_delimiter',
        generated_query: query.query.replace(/\s+/g, '')
      });
    }
    return variants.map((variant) => ({
      schema_version: 'ds2-query-normalization-v0.1',
      inspection_id: inspectionId,
      dataset_id: 'DS2',
      canonical_query_id: query.query_id,
      canonical_query: query.query,
      ...variant,
      provenance: {
        source_query_pack: query.source_query_pack,
        source_query_id: query.query_id,
        rule: variant.variation_type
      }
    }));
  });

  const ds3 = queryRows.flatMap((query) =>
    (query.expected_relationships || [])
      .filter((relationship) => relationship.attribute)
      .map((relationship) => ({
        schema_version: 'ds3-search-facet-v0.1',
        inspection_id: inspectionId,
        dataset_id: 'DS3',
        canonical_query_id: query.query_id,
        query: `${relationship.attribute} ${relationship.browse_node || query.query}`.trim(),
        facet_or_attribute: relationship.attribute,
        expected_browse_node: relationship.browse_node || null,
        provenance: {
          source_query_pack: query.source_query_pack,
          source_query_id: query.query_id,
          source_relationship_type: relationship.type
        }
      }))
  );

  const ds4 = queryPacks.flatMap((pack) =>
    (pack.advanced_scenarios || []).map((scenario) => ({
      schema_version: 'ds4-advanced-retrieval-v0.1',
      inspection_id: inspectionId,
      dataset_id: 'DS4',
      ...scenario,
      provenance: {
        source_query_pack: pack.query_pack_id,
        ...(scenario.provenance || {})
      }
    }))
  );

  const outputs = [
    ['ds1-canonical-search.jsonl', ds1],
    ['ds2-query-normalization.jsonl', ds2],
    ['ds3-search-facet.jsonl', ds3],
    ['ds4-advanced-retrieval.jsonl', ds4]
  ];

  for (const [fileName, rows] of outputs) {
    const filePath = path.join(datasetDir, fileName);
    for (const row of rows) {
      appendJsonl(filePath, row);
    }
  }

  return {
    DS1: {
      path: path.join(datasetDir, 'ds1-canonical-search.jsonl'),
      rows: ds1.length,
      status: ds1.length > 0 ? 'generated' : 'empty'
    },
    DS2: {
      path: path.join(datasetDir, 'ds2-query-normalization.jsonl'),
      rows: ds2.length,
      status: ds2.length > 0 ? 'generated' : 'empty'
    },
    DS3: {
      path: path.join(datasetDir, 'ds3-search-facet.jsonl'),
      rows: ds3.length,
      status: ds3.length > 0 ? 'generated' : 'empty'
    },
    DS4: {
      path: path.join(datasetDir, 'ds4-advanced-retrieval.jsonl'),
      rows: ds4.length,
      status: ds4.length > 0 ? 'generated' : 'empty'
    }
  };
}

function summarizeExistingDatasets(outputDir) {
  const datasetDir = path.join(outputDir, 'evidence', 'datasets');
  const files = {
    DS1: 'ds1-canonical-search.jsonl',
    DS2: 'ds2-query-normalization.jsonl',
    DS3: 'ds3-search-facet.jsonl',
    DS4: 'ds4-advanced-retrieval.jsonl'
  };
  return Object.fromEntries(
    Object.entries(files).map(([datasetId, fileName]) => {
      const filePath = path.join(datasetDir, fileName);
      const rows = readJsonl(filePath).length;
      return [
        datasetId,
        {
          path: filePath,
          rows,
          status: rows > 0 ? 'generated' : 'empty'
        }
      ];
    })
  );
}

export function summarizePluginEvidence(pluginId, outputDir) {
  if (pluginId === 'submitted-search') {
    const evidenceFile = path.join(outputDir, 'evidence', 'experiments', 'submitted-search.jsonl');
    const rows = readJsonl(evidenceFile);
    const blocked = rows.filter((row) => row.classification).length;
    const completed = rows.length - blocked;
    return {
      plugin_id: 'submitted-search',
      status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : rows.length > 0 ? 'blocked' : 'not_run',
      evidence_file: evidenceFile,
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
          query_id: row.query_id,
          status: row.status,
          endpoint: row.endpoint
        }))
    };
  }

  if (pluginId === 'rendered-search') {
    const evidenceFile = path.join(outputDir, 'evidence', 'experiments', 'rendered-search.jsonl');
    const rows = readJsonl(evidenceFile);
    if (rows.length === 0) return null;
    const completed = rows.filter((row) => row.rendered_search?.ok).length;
    const withVisibleDropdown = rows.filter((row) => row.endpoint_comparison?.visible_dropdown_observed).length;
    const blocked = rows.length - completed;
    const limitations = rows.flatMap((row) =>
      [row.rendered_search, row.rendered_autocomplete]
        .filter((capture) => capture?.classification?.category === 'infrastructure')
        .map((capture) => ({
          code: capture.classification.code,
          label: capture.classification.label,
          query_id: row.query_id,
          status: capture.status,
          endpoint: row.rendered_search?.endpoint
        }))
    );
    return {
      plugin_id: 'rendered-search',
      // A rendered page that loaded but whose dropdown/input could not be
      // observed is a warning, not a clean pass — reflect that in the status
      // so its reason surfaces in attention and the timeline lane.
      status: completed > 0 ? (blocked > 0 || limitations.length > 0 ? 'warn' : 'pass') : 'blocked',
      evidence_file: evidenceFile,
      observations: rows.length,
      completed_observations: completed,
      observations_with_visible_dropdown: withVisibleDropdown,
      blocked_observations: blocked,
      confidence: completed === rows.length && rows.length > 0 ? 'High' : completed > 0 ? 'Medium' : 'Low',
      evidence_quality: completed === rows.length && rows.length > 0 ? 'rendered' : 'partial',
      infrastructure_limitations: limitations
    };
  }

  if (pluginId === 'rendered-product') {
    const evidenceFile = path.join(outputDir, 'evidence', 'experiments', 'rendered-product.jsonl');
    const rows = readJsonl(evidenceFile);
    if (rows.length === 0) return null;
    const completed = rows.filter((row) => row.ok).length;
    const withPrice = rows.filter((row) => row.completeness?.has_price).length;
    const blocked = rows.length - completed;
    return {
      plugin_id: 'rendered-product',
      status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : 'blocked',
      evidence_file: evidenceFile,
      observations: rows.length,
      completed_observations: completed,
      products_with_price: withPrice,
      blocked_observations: blocked,
      confidence: completed === rows.length && rows.length > 0 ? 'High' : completed > 0 ? 'Medium' : 'Low',
      evidence_quality: completed === rows.length && rows.length > 0 ? 'rendered' : 'partial',
      infrastructure_limitations: rows
        .filter((row) => row.classification?.category === 'infrastructure')
        .map((row) => ({ code: row.classification.code, label: row.classification.label, query_id: row.product_handle, status: row.status, endpoint: row.endpoint }))
    };
  }

  if (pluginId === 'browse-graph') {
    const evidenceFile = path.join(outputDir, 'evidence', 'experiments', 'browse-graph.jsonl');
    const rows = readJsonl(evidenceFile);
    if (rows.length === 0) return null;
    const completed = rows.filter((row) => row.ok).length;
    const blocked = rows.length - completed;
    return {
      plugin_id: 'browse-graph',
      status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : 'blocked',
      evidence_file: evidenceFile,
      observations: rows.length,
      completed_observations: completed,
      blocked_observations: blocked,
      confidence: completed > 0 ? 'Medium' : 'Low',
      evidence_quality: completed === rows.length && rows.length > 0 ? 'bounded' : 'partial',
      infrastructure_limitations: rows
        .filter((row) => row.classification?.category === 'infrastructure')
        .map((row) => ({ code: row.classification.code, label: row.classification.label, query_id: row.collection_handle, status: row.status, endpoint: row.endpoint }))
    };
  }

  if (pluginId === 'autocomplete') {
    const evidenceFile = path.join(outputDir, 'evidence', 'experiments', 'autocomplete.jsonl');
    const rows = readJsonl(evidenceFile);
    const blocked = rows.filter((row) => row.classification).length;
    const rowsWithSuggestions = rows.filter((row) => row.observed?.suggestion_count > 0).length;
    return {
      plugin_id: 'autocomplete',
      status:
        rowsWithSuggestions > 0
          ? blocked > 0
            ? 'warn'
            : 'pass'
          : blocked === rows.length && rows.length > 0
            ? 'blocked'
            : rows.length > 0
              ? 'warn'
              : 'not_run',
      evidence_file: evidenceFile,
      observations: rows.length,
      observations_with_suggestions: rowsWithSuggestions,
      blocked_observations: blocked,
      confidence: rowsWithSuggestions > 0 ? 'Medium' : 'Low',
      evidence_quality: rowsWithSuggestions === rows.length && rows.length > 0 ? 'bounded' : 'partial',
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

  if (['facets', 'recommendations', 'mobile', 'competitor-inspection'].includes(pluginId)) {
    const evidenceFile = path.join(outputDir, 'evidence', 'experiments', `${pluginId}.jsonl`);
    const rows = readJsonl(evidenceFile);
    const blocked = rows.filter((row) => row.classification).length;
    const completed = rows.length - blocked;
    return {
      plugin_id: pluginId,
      status: completed > 0 ? (blocked > 0 ? 'warn' : 'pass') : rows.length > 0 ? 'blocked' : 'not_run',
      evidence_file: evidenceFile,
      observations: rows.length,
      completed_observations: completed,
      blocked_observations: blocked,
      confidence: completed > 0 ? 'Medium' : 'Low',
      evidence_quality: completed === rows.length && rows.length > 0 ? 'bounded' : rows.length > 0 ? 'partial' : 'not_applicable',
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

  return null;
}

function statusToIcon(status) {
  if (['pass', 'complete', 'available'].includes(status)) return 'PASS';
  if (['warn', 'partial', 'skipped'].includes(status)) return 'WARN';
  if (['blocked', 'fail'].includes(status)) return 'FAIL';
  return 'NOT_RUN';
}

export function buildCrawlHealth({ siteProfile, pluginResults, evaluation }) {
  const endpointByLabel = new Map((siteProfile.endpoint_discovery || []).map((entry) => [entry.label, entry]));
  const pluginById = new Map(pluginResults.map((result) => [result.plugin_id, result]));
  const homepage = endpointByLabel.get('homepage');
  const products = endpointByLabel.get('products_json');
  const collections = endpointByLabel.get('collections_json');
  const submittedSearch = pluginById.get('submitted-search');
  const autocomplete = pluginById.get('autocomplete');
  const facets = pluginById.get('facets');
  const recommendations = pluginById.get('recommendations');
  const mobile = pluginById.get('mobile');
  const competitorInspection = pluginById.get('competitor-inspection');
  const renderedSearch = pluginById.get('rendered-search');
  const renderedProduct = pluginById.get('rendered-product');
  const browseGraph = pluginById.get('browse-graph');

  return [
    {
      component: 'Homepage',
      status: homepage?.ok ? 'PASS' : 'FAIL',
      confidence: homepage?.confidence || 'Low',
      notes: homepage?.classification?.label || (homepage?.ok ? 'Homepage responded.' : 'Homepage was not observed.')
    },
    {
      component: 'Search',
      status: statusToIcon(submittedSearch?.status || 'not_run'),
      confidence: submittedSearch?.confidence || 'Unknown',
      notes: submittedSearch
        ? `${submittedSearch.completed_observations}/${submittedSearch.observations} submitted search observations completed.`
        : 'Submitted search was not run.'
    },
    {
      component: 'Browse',
      status: browseGraph ? statusToIcon(browseGraph.status) : collections?.ok ? 'WARN' : 'FAIL',
      confidence: browseGraph?.confidence || siteProfile.catalog_discovery?.confidence || 'Low',
      notes: browseGraph
        ? `${browseGraph.completed_observations}/${browseGraph.observations} collections inventoried with membership; flat browse graph (hierarchical tree from storefront nav is a future slice).`
        : collections?.ok
          ? 'Collections endpoint responded; browse inventory is not enabled in this evaluation manifest.'
          : collections?.classification?.label || 'Collections endpoint was not observed.'
    },
    {
      component: 'Autocomplete',
      status: statusToIcon(autocomplete?.status || 'not_run'),
      confidence: autocomplete?.confidence || 'Unknown',
      notes: autocomplete
        ? `${autocomplete.observations_with_suggestions}/${autocomplete.observations} autocomplete observations returned suggestions.`
        : 'Autocomplete was not run.'
    },
    {
      component: 'Product Pages',
      status: renderedProduct ? statusToIcon(renderedProduct.status) : products?.ok ? 'WARN' : 'FAIL',
      confidence: renderedProduct?.confidence || siteProfile.catalog_discovery?.confidence || 'Low',
      notes: renderedProduct
        ? `${renderedProduct.completed_observations}/${renderedProduct.observations} product pages rendered; ${renderedProduct.products_with_price}/${renderedProduct.observations} showed a price (P008).`
        : products?.ok
          ? 'Products endpoint responded; rendered product capture is not enabled in this evaluation manifest.'
          : products?.classification?.label || 'Products endpoint was not observed.'
    },
    {
      component: 'Facets',
      status: statusToIcon(facets?.status || 'not_run'),
      confidence: facets?.confidence || 'Unknown',
      notes: facets
        ? `${facets.completed_observations}/${facets.observations} facet markup observations completed.`
        : 'Facet inspection is registered in the mission workflow but not enabled in this evaluation manifest.'
    },
    {
      component: 'Recommendations',
      status: statusToIcon(recommendations?.status || 'not_run'),
      confidence: recommendations?.confidence || 'Unknown',
      notes: recommendations
        ? `${recommendations.completed_observations}/${recommendations.observations} recommendations endpoint observations completed.`
        : 'Recommendation inspection is registered in the mission workflow but not enabled in this evaluation manifest.'
    },
    {
      component: 'Mobile',
      status: statusToIcon(mobile?.status || 'not_run'),
      confidence: mobile?.confidence || 'Unknown',
      notes: mobile
        ? `${mobile.completed_observations}/${mobile.observations} mobile user-agent observations completed. HTTP-level only; rendered mobile capture remains a platform capability gap.`
        : 'Mobile rendering is not enabled in this first implementation slice.'
    },
    {
      component: 'Competitor Inspection',
      status: statusToIcon(competitorInspection?.status || 'not_run'),
      confidence: competitorInspection?.confidence || 'Unknown',
      notes: competitorInspection
        ? `${competitorInspection.completed_observations}/${competitorInspection.observations} same-query peer observations completed.`
        : 'Peer inspection is not enabled in this evaluation manifest.'
    },
    {
      component: 'Rendered Storefront',
      status: statusToIcon(renderedSearch?.status || 'not_run'),
      confidence: renderedSearch?.confidence || 'Unknown',
      notes: renderedSearch
        ? `${renderedSearch.completed_observations}/${renderedSearch.observations} rendered captures completed; ${renderedSearch.observations_with_visible_dropdown}/${renderedSearch.observations} showed a visible autocomplete dropdown (P008).`
        : 'Rendered capture (P008) is not enabled in this evaluation manifest.'
    }
  ];
}

export function collectLimitations({ siteProfile, pluginResults, platformReport }) {
  const platformCapabilityGaps = (platformReport.checks || [])
    .filter((check) => check.status === 'fail')
    .map((check) => ({
      capability_id: check.capability_id,
      name: check.name,
      status: check.capability_status,
      classification: 'platform_capability_gap',
      notes: check.notes
    }));

  const infrastructureLimitations = [
    ...(siteProfile.access?.limitations || []),
    ...pluginResults.flatMap((result) => result.infrastructure_limitations || [])
  ];

  return {
    platform_capability_gaps: platformCapabilityGaps,
    infrastructure_limitations: infrastructureLimitations,
    commerce_observations: [],
    separation_rule:
      'Platform capability gaps and infrastructure limitations are recorded separately from observed ecommerce behavior.'
  };
}

export function evidenceCoverage({ crawlHealth, datasetSummary, pluginResults }) {
  const components = crawlHealth.length;
  const observedComponents = crawlHealth.filter((entry) => entry.status === 'PASS' || entry.status === 'WARN').length;
  const pluginObservations = pluginResults.reduce((sum, result) => sum + (result.observations || 0), 0);
  const datasetRows = Object.values(datasetSummary).reduce((sum, dataset) => sum + dataset.rows, 0);
  return {
    component_coverage_percent: Math.round((observedComponents / components) * 100),
    plugin_observations: pluginObservations,
    dataset_rows: datasetRows,
    evidence_quality:
      observedComponents === components ? 'complete' : observedComponents >= Math.ceil(components / 2) ? 'partial' : 'limited'
  };
}

function buildDashboard({
  inspectionId,
  startedAt,
  endedAt,
  evaluation,
  target,
  siteProfile,
  crawlHealth,
  datasetSummary,
  pluginResults,
  platformReport,
  artifactIndex
}) {
  const coverage = evidenceCoverage({ crawlHealth, datasetSummary, pluginResults });
  const failedOrBlocked = crawlHealth.filter((entry) => entry.status === 'FAIL').length;
  const warnings = crawlHealth.filter((entry) => entry.status === 'WARN').length;
  const status = failedOrBlocked > 0 ? 'partial' : warnings > 0 ? 'partial' : 'complete';
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

  return {
    schema_version: 'inspection-dashboard-v0.1',
    inspection_id: inspectionId,
    purpose_question: 'Can I trust this inspection enough to generate downstream reports?',
    crawl_summary: {
      inspection_timestamp: startedAt,
      target_url: target.primary_url,
      target_name: target.name,
      platform_detection: siteProfile.platform_detection,
      overall_inspection_status: status,
      inspection_duration_ms: durationMs,
      evidence_quality: coverage.evidence_quality,
      overall_confidence: coverage.component_coverage_percent >= 70 ? 'Medium' : 'Low'
    },
    operational_summary: {
      experiments_completed: pluginResults.filter((result) => result.status === 'pass' || result.status === 'warn').length,
      blocked_experiments: pluginResults.filter((result) => result.status === 'blocked').length,
      warnings,
      evidence_files: artifactIndex.groups.evidence.length,
      screenshot_count: artifactIndex.groups.screenshots.length,
      downstream_report_readiness:
        coverage.component_coverage_percent >= 70 && platformReport.capability_counts.fail === 0 ? 'bounded' : 'not_ready',
      readiness_notes:
        coverage.component_coverage_percent >= 70
          ? 'Inspection evidence is sufficient for a bounded technical Inspection Report export.'
          : 'Inspection evidence is incomplete for downstream exports.'
    },
    crawl_health: crawlHealth,
    evidence_coverage: coverage,
    platform_capability: {
      status: platformReport.overall_status,
      report_path: path.join(evaluation.output.base_dir, inspectionId, 'platform-capability-report.json'),
      failed_capabilities: platformReport.checks.filter((check) => check.status === 'fail').map((check) => check.capability_id)
    },
    artifact_explorer: artifactIndex.groups
  };
}

function artifactGroup(filePath) {
  if (filePath.includes('/evidence/datasets/')) return 'datasets';
  if (filePath.includes('/evidence/experiments/')) return 'evidence';
  if (filePath.includes('/screenshots/')) return 'screenshots';
  if (filePath.includes('/raw/http/')) return 'raw_http';
  if (filePath.includes('/raw/html/')) return 'raw_html';
  if (filePath.endsWith('timeline.jsonl')) return 'timeline';
  if (filePath.endsWith('inspection-model.json')) return 'inspection_model';
  if (
    filePath.includes('/reports/') ||
    filePath.endsWith('inspection-report.json') ||
    filePath.endsWith('inspection-report.md') ||
    filePath.endsWith('dashboard.html')
  ) {
    return 'reports';
  }
  return 'other';
}

function buildArtifactIndex(outputDir, inspectionId) {
  const files = listFilesRecursive(outputDir).sort();
  const groups = {
    evidence: [],
    reports: [],
    datasets: [],
    screenshots: [],
    raw_http: [],
    raw_html: [],
    timeline: [],
    inspection_model: [],
    other: []
  };
  for (const file of files) {
    groups[artifactGroup(file)].push(file);
  }
  return {
    schema_version: 'artifact-index-v0.1',
    inspection_id: inspectionId,
    generated_at: new Date().toISOString(),
    artifact_count: files.length,
    groups
  };
}

function buildInspectionReportMarkdown(report) {
  const lines = [
    `# Inspection Report: ${report.target.name}`,
    '',
    `Inspection ID: ${report.inspection_id}`,
    `Generated: ${report.generated_at}`,
    `Target URL: ${report.target.primary_url}`,
    `Status: ${report.dashboard.crawl_summary.overall_inspection_status}`,
    `Evidence quality: ${report.dashboard.crawl_summary.evidence_quality}`,
    `Overall confidence: ${report.dashboard.crawl_summary.overall_confidence}`,
    '',
    '## Inspection Dashboard',
    '',
    '| Component | Status | Confidence | Notes |',
    '| --- | --- | --- | --- |',
    ...report.crawl_health.map(
      (entry) =>
        `| ${entry.component} | ${entry.status} | ${entry.confidence} | ${String(entry.notes).replace(/\|/g, '/')} |`
    ),
    '',
    '## Platform Capability',
    '',
    `Platform status: ${report.platform_capability_report.overall_status}`,
    `Capability evidence quality: ${report.platform_capability_report.evidence_quality}`,
    '',
    '## Dataset Summary',
    '',
    '| Dataset | Status | Rows | Path |',
    '| --- | --- | ---: | --- |',
    ...Object.entries(report.datasets).map(
      ([datasetId, dataset]) => `| ${datasetId} | ${dataset.status} | ${dataset.rows} | ${dataset.path} |`
    ),
    '',
    '## Limitations',
    '',
    `Platform capability gaps: ${report.limitations.platform_capability_gaps.length}`,
    `Infrastructure limitations: ${report.limitations.infrastructure_limitations.length}`,
    '',
    '## Artifact Explorer',
    '',
    ...Object.entries(report.artifact_explorer.groups).map(
      ([group, files]) => `- ${group}: ${files.length} artifact${files.length === 1 ? '' : 's'}`
    ),
    ''
  ];

  return `${lines.join('\n')}\n`;
}

function writeHistoryRow(historyPath, row) {
  const rows = readJsonl(historyPath).filter((entry) => entry.inspection_id !== row.inspection_id);
  rows.push(row);
  writeText(historyPath, `${rows.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

function writeCheckpoint({
  outputDir,
  inspectionId,
  startedAt,
  evaluationPath,
  evaluation,
  target,
  pluginGraph,
  pluginState,
  artifactIndex,
  status
}) {
  const checkpoint = {
    schema_version: 'checkpoint-v0.1',
    inspection_id: inspectionId,
    written_at: new Date().toISOString(),
    started_at: startedAt,
    output_dir: outputDir,
    status,
    evaluation_manifest: evaluationPath,
    evaluation_id: evaluation.evaluation_id,
    target_id: target.target_id,
    site_profile: path.join(outputDir, 'site-profile.json'),
    plugin_graph: pluginGraph,
    plugin_state: pluginState,
    completed_phases: Object.values(pluginState.plugins || {})
      .filter((entry) => ['pass', 'warn', 'blocked'].includes(entry.status))
      .map((entry) => entry.plugin_id),
    failed_phases: Object.values(pluginState.plugins || {})
      .filter((entry) => entry.status === 'fail' || entry.status === 'error')
      .map((entry) => entry.plugin_id),
    pending_phases: pluginGraph.execution_order.filter((pluginId) => !pluginState.plugins?.[pluginId]),
    evidence_references: artifactIndex.groups.evidence,
    timeline_reference: path.join(outputDir, 'evidence', 'timeline.jsonl')
  };
  writeJson(path.join(outputDir, 'checkpoint.json'), checkpoint);
  return checkpoint;
}

// Site profile reuse honors the Evaluation Manifest cache contract:
// a resumed run keeps its own profile, a fresh run may reuse the shared
// profile at site_profile.path while it is younger than max_age_hours,
// and every decision is recorded as cache metadata evidence.
async function resolveSiteProfile({ outputDir, evaluation, adapter }) {
  const runProfilePath = path.join(outputDir, 'site-profile.json');
  const sharedProfilePath = evaluation.site_profile?.path || null;
  const maxAgeHours = evaluation.site_profile?.max_age_hours ?? 0;
  const cacheKey = `site-profile:${evaluation.target}`;

  const metadata = (decision, { ageHours = null, reason, createdAt }) => ({
    schema_version: 'cache-metadata-v0.1',
    cache_key: cacheKey,
    artifact_path: sharedProfilePath || runProfilePath,
    created_at: createdAt,
    max_age_hours: maxAgeHours,
    decision,
    age_hours: ageHours,
    reason
  });

  if (exists(runProfilePath)) {
    const siteProfile = readJson(runProfilePath);
    return {
      siteProfile,
      cacheMetadata: metadata('reused_run_checkpoint', {
        createdAt: siteProfile.discovered_at,
        reason: 'Run directory already contains a site profile, so the resumed run must not re-discover it.'
      })
    };
  }

  if (sharedProfilePath && maxAgeHours > 0 && exists(sharedProfilePath)) {
    const sharedProfile = readJson(sharedProfilePath);
    const ageHours = (Date.now() - new Date(sharedProfile.discovered_at).getTime()) / 3600000;
    if (Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= maxAgeHours) {
      return {
        siteProfile: sharedProfile,
        cacheMetadata: metadata('reused_shared_cache', {
          ageHours: Math.round(ageHours * 100) / 100,
          createdAt: sharedProfile.discovered_at,
          reason: `Shared site profile is ${Math.round(ageHours * 100) / 100} hours old, within the ${maxAgeHours} hour freshness window.`
        })
      };
    }
  }

  const siteProfile = await adapter.discoverSiteProfile();
  if (sharedProfilePath) {
    ensureDir(path.dirname(sharedProfilePath));
    writeJson(sharedProfilePath, siteProfile);
  }
  return {
    siteProfile,
    cacheMetadata: metadata('refreshed_live_discovery', {
      ageHours: 0,
      createdAt: siteProfile.discovered_at,
      reason: sharedProfilePath
        ? 'No fresh shared site profile existed, so discovery ran live and refreshed the shared cache.'
        : 'Evaluation manifest declares no shared site profile path, so discovery ran live for this run only.'
    })
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const existingCheckpoint = args.resume ? readJson(path.join(args.resume, 'checkpoint.json')) : null;
  const evaluationPath = args.evaluation || existingCheckpoint?.evaluation_manifest;
  const evaluation = readJson(evaluationPath);
  const target = readJson(evaluation.target);
  const queryPacks = evaluation.query_packs.map((queryPackPath) => readJson(queryPackPath));
  const queryRows = collectQueryRows(queryPacks);
  const selectedPlugins = args.only || evaluation.plugins;
  const inspectionId = existingCheckpoint?.inspection_id || createInspectionId(evaluation.generation);
  const outputDir = args.resume || path.join(evaluation.output.base_dir, inspectionId);
  const startedAt = existingCheckpoint?.started_at || new Date().toISOString();

  ensureDir(outputDir);
  ensureDir(path.join(outputDir, 'evidence', 'experiments'));
  ensureDir(path.join(outputDir, 'evidence', 'datasets'));
  ensureDir(path.join(outputDir, 'raw', 'http'));
  ensureDir('inspection-history');

  const timelinePath = path.join(outputDir, 'evidence', 'timeline.jsonl');
  const timeline = (event, details = {}) => {
    appendJsonl(timelinePath, {
      inspection_id: inspectionId,
      at: new Date().toISOString(),
      event,
      ...details
    });
  };

  timeline('inspection_started', {
    evaluation_id: evaluation.evaluation_id,
    target_id: target.target_id,
    resumed_from_checkpoint: Boolean(existingCheckpoint)
  });

  writeJson(path.join(outputDir, 'run-manifest.json'), {
    schema_version: 'inspection-run-manifest-v0.1',
    inspection_id: inspectionId,
    evaluation_manifest_path: evaluationPath,
    evaluation,
    target,
    query_packs: queryPacks.map((pack) => ({
      query_pack_id: pack.query_pack_id,
      query_count: pack.queries?.length || 0
    }))
  });

  const platformReport = exists(path.join(outputDir, 'platform-capability-report.json'))
    ? readJson(path.join(outputDir, 'platform-capability-report.json'))
    : runPlatformValidation({
        generation: evaluation.generation,
        target,
        outputDir
      });
  timeline('platform_validation_completed', {
    status: platformReport.overall_status,
    failed_capabilities: platformReport.capability_counts.fail
  });

  const adapter = createShopifyAdapter(target);
  const { siteProfile, cacheMetadata } = await resolveSiteProfile({
    outputDir,
    evaluation,
    adapter
  });
  writeJson(path.join(outputDir, 'site-profile.json'), siteProfile);
  writeJson(path.join(outputDir, 'cache-metadata.json'), cacheMetadata);
  writeJson(path.join(outputDir, 'raw', 'http', 'site-profile-endpoints.json'), siteProfile.endpoint_discovery);
  timeline('site_profile_cache_decision', {
    decision: cacheMetadata.decision,
    age_hours: cacheMetadata.age_hours,
    reason: cacheMetadata.reason
  });
  timeline('site_profile_written', {
    platform: siteProfile.platform_detection.platform,
    confidence: siteProfile.platform_detection.confidence,
    limitations: siteProfile.access.limitations.length
  });

  const datasetSummary = exists(path.join(outputDir, 'evidence', 'datasets', 'ds1-canonical-search.jsonl'))
    ? summarizeExistingDatasets(outputDir)
    : writeDatasets({ outputDir, inspectionId, queryPacks, queryRows });
  timeline('datasets_generated', {
    datasets: datasetSummary
  });

  const pluginGraph = buildPluginGraph(selectedPlugins);
  writeJson(path.join(outputDir, 'plugin-dependency-graph.json'), pluginGraph);
  timeline('plugin_graph_built', {
    execution_order: pluginGraph.execution_order
  });

  const pluginState = exists(path.join(outputDir, 'plugin-state.json'))
    ? readJson(path.join(outputDir, 'plugin-state.json'))
    : {
        schema_version: 'plugin-state-v0.1',
        inspection_id: inspectionId,
        plugins: {}
      };

  for (const pluginId of pluginGraph.execution_order) {
    if (['pass', 'warn', 'blocked'].includes(pluginState.plugins?.[pluginId]?.status)) {
      timeline('plugin_skipped_reused_checkpoint', {
        plugin_id: pluginId,
        prior_status: pluginState.plugins[pluginId].status
      });
      continue;
    }

    timeline('plugin_started', { plugin_id: pluginId });
    const plugin = await loadPlugin(pluginId);
    const startedPluginAt = new Date().toISOString();
    const result = await plugin.run({
      inspectionId,
      outputDir,
      target,
      evaluation,
      queryRows,
      siteProfile,
      adapter,
      timeline
    });
    const endedPluginAt = new Date().toISOString();
    pluginState.plugins[pluginId] = {
      plugin_id: pluginId,
      status: result.status,
      started_at: startedPluginAt,
      ended_at: endedPluginAt,
      evidence_file: result.evidence_file,
      observations: result.observations,
      confidence: result.confidence,
      evidence_quality: result.evidence_quality
    };
    writeJson(path.join(outputDir, 'plugin-state.json'), pluginState);
    timeline('plugin_completed', {
      plugin_id: pluginId,
      status: result.status,
      observations: result.observations
    });

    if (args.simulateInterruptAfter === pluginId) {
      const interruptedIndex = buildArtifactIndex(outputDir, inspectionId);
      writeCheckpoint({
        outputDir,
        inspectionId,
        startedAt,
        evaluationPath,
        evaluation,
        target,
        pluginGraph,
        pluginState,
        artifactIndex: interruptedIndex,
        status: 'interrupted_for_validation'
      });
      timeline('inspection_interrupted_for_validation', { plugin_id: pluginId });
      console.log(`Inspection interrupted for validation after ${pluginId}: ${outputDir}`);
      return;
    }
  }

  const pluginResults = pluginGraph.execution_order
    .map((pluginId) => summarizePluginEvidence(pluginId, outputDir))
    .filter(Boolean);

  const crawlHealth = buildCrawlHealth({ siteProfile, pluginResults, evaluation });
  const preliminaryArtifactIndex = buildArtifactIndex(outputDir, inspectionId);
  const endedAt = new Date().toISOString();
  const dashboard = buildDashboard({
    inspectionId,
    startedAt,
    endedAt,
    evaluation,
    target,
    siteProfile,
    crawlHealth,
    datasetSummary,
    pluginResults,
    platformReport,
    artifactIndex: preliminaryArtifactIndex
  });
  const limitations = collectLimitations({ siteProfile, pluginResults, platformReport });

  const inspectionModel = {
    schema_version: 'inspection-model-v0.1',
    inspection_id: inspectionId,
    generated_at: endedAt,
    evaluation_id: evaluation.evaluation_id,
    target_id: target.target_id,
    platform_detection: siteProfile.platform_detection,
    dashboard,
    crawl_health: crawlHealth,
    datasets: datasetSummary,
    plugin_results: pluginResults,
    limitations,
    evidence_model: {
      raw_evidence_is_immutable: true,
      confidence_scope: 'observation_level',
      evidence_quality_scope: 'coverage_and_completeness'
    }
  };
  writeJson(path.join(outputDir, 'inspection-model.json'), inspectionModel);

  let artifactIndex = buildArtifactIndex(outputDir, inspectionId);
  writeJson(path.join(outputDir, 'artifact-index.json'), artifactIndex);
  artifactIndex = buildArtifactIndex(outputDir, inspectionId);
  writeJson(path.join(outputDir, 'artifact-index.json'), artifactIndex);

  const finalDashboard = {
    ...dashboard,
    artifact_explorer: artifactIndex.groups
  };
  writeJson(path.join(outputDir, 'dashboard.json'), finalDashboard);

  const inspectionReport = {
    schema_version: 'inspection-report-v0.1',
    inspection_id: inspectionId,
    generation: evaluation.generation,
    generated_at: endedAt,
    target: {
      target_id: target.target_id,
      name: target.name,
      primary_url: target.primary_url,
      canonical_platform_host: target.platform?.canonical_platform_host || null
    },
    inspection_window: {
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: new Date(endedAt).getTime() - new Date(startedAt).getTime()
    },
    dashboard: finalDashboard,
    crawl_health: crawlHealth,
    site_discovery: siteProfile,
    platform_capability_report: platformReport,
    endpoint_discovery: siteProfile.endpoint_discovery,
    datasets: datasetSummary,
    plugin_results: pluginResults,
    limitations,
    artifact_explorer: artifactIndex
  };

  writeJson(path.join(outputDir, 'inspection-report.json'), inspectionReport);

  const finalIndex = buildArtifactIndex(outputDir, inspectionId);
  writeJson(path.join(outputDir, 'artifact-index.json'), finalIndex);
  inspectionReport.artifact_explorer = finalIndex;
  inspectionReport.dashboard.artifact_explorer = finalIndex.groups;
  writeJson(path.join(outputDir, 'inspection-report.json'), inspectionReport);
  writeText(path.join(outputDir, 'inspection-report.md'), buildInspectionReportMarkdown(inspectionReport));
  writeText(
    path.join(outputDir, 'dashboard.html'),
    buildDashboardHtml({
      report: inspectionReport,
      timelineRows: readJsonl(path.join(outputDir, 'evidence', 'timeline.jsonl')),
      outputDir
    })
  );
  const completedIndex = buildArtifactIndex(outputDir, inspectionId);
  writeJson(path.join(outputDir, 'artifact-index.json'), completedIndex);
  inspectionReport.artifact_explorer = completedIndex;
  inspectionReport.dashboard.artifact_explorer = completedIndex.groups;
  writeJson(path.join(outputDir, 'dashboard.json'), inspectionReport.dashboard);
  writeJson(path.join(outputDir, 'inspection-report.json'), inspectionReport);
  writeText(path.join(outputDir, 'inspection-report.md'), buildInspectionReportMarkdown(inspectionReport));
  writeText(
    path.join(outputDir, 'dashboard.html'),
    buildDashboardHtml({
      report: inspectionReport,
      timelineRows: readJsonl(path.join(outputDir, 'evidence', 'timeline.jsonl')),
      outputDir
    })
  );
  const checkpoint = writeCheckpoint({
    outputDir,
    inspectionId,
    startedAt,
    evaluationPath,
    evaluation,
    target,
    pluginGraph,
    pluginState,
    artifactIndex: completedIndex,
    status: 'complete'
  });

  writeHistoryRow(`inspection-history/${evaluation.generation}.jsonl`, {
    schema_version: 'inspection-history-row-v0.1',
    inspection_id: inspectionId,
    evaluation_id: evaluation.evaluation_id,
    target_id: target.target_id,
    target_name: target.name,
    timestamp: startedAt,
    generation: evaluation.generation,
    duration_ms: inspectionReport.inspection_window.duration_ms,
    status: finalDashboard.crawl_summary.overall_inspection_status,
    overall_confidence: finalDashboard.crawl_summary.overall_confidence,
    evidence_quality: finalDashboard.crawl_summary.evidence_quality,
    evidence_coverage: finalDashboard.evidence_coverage.component_coverage_percent,
    output_dir: outputDir
  });

  timeline('inspection_completed', {
    status: checkpoint.status,
    output_dir: outputDir
  });

  console.log(`Inspection complete: ${outputDir}`);
}

// Only run the inspection when invoked directly, so the module's exported
// helpers can be imported (e.g. by retry-capture) without executing a run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
