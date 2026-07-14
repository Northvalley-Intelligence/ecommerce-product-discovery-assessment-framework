#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  exists,
  latestDirectory,
  listFilesRecursive,
  readJson,
  readJsonl
} from '../lib/fs-json.mjs';
import { buildPluginGraph, readPluginMetadata } from './plugin-loader.mjs';

const failures = [];
const warnings = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function requireFile(filePath) {
  assert(exists(filePath), `Missing required file: ${filePath}`);
}

function requiredFields(object, fields, label) {
  for (const field of fields) {
    assert(Object.prototype.hasOwnProperty.call(object, field), `${label} missing field: ${field}`);
  }
}

const REQUIRED_CONTRACTS = [
  'workspace',
  'evaluation_manifest',
  'target_manifest',
  'query_pack',
  'plugin_metadata',
  'inspection_artifacts',
  'site_profile',
  'platform_capability_registry',
  'platform_capability_dependency_graph',
  'platform_capability_report',
  'platform_capability_timeline',
  'platform_metrics',
  'platform_validation_suite',
  'inspection_history_row',
  'checkpoint',
  'artifact_index',
  'plugin_state',
  'cache_metadata'
];

function validateJsonContracts() {
  const contracts = readJson('schemas/inspection/contracts.json');
  assert(contracts.schema_version === 'inspection-contracts-v0.1', 'Unexpected inspection contract schema version.');
  for (const contractName of REQUIRED_CONTRACTS) {
    assert(contracts.contracts?.[contractName], `Missing schema contract: ${contractName}`);
  }
  for (const [contractName, contract] of Object.entries(contracts.contracts || {})) {
    assert(Array.isArray(contract.required) && contract.required.length > 0, `${contractName} contract has no required fields.`);
  }
}

function listEvaluationManifests() {
  return fs
    .readdirSync('evaluations')
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join('evaluations', name));
}

function validateManifests() {
  const manifests = listEvaluationManifests();
  assert(manifests.length > 0, 'No evaluation manifests found in evaluations/.');

  for (const manifestPath of manifests) {
    const label = `Evaluation ${manifestPath}`;
    const evaluation = readJson(manifestPath);
    const target = readJson(evaluation.target);
    const queryPacks = evaluation.query_packs.map((queryPackPath) => readJson(queryPackPath));
    const workspace = readJson(evaluation.workspace);

    requiredFields(evaluation, ['schema_version', 'evaluation_id', 'evaluation_type', 'generation', 'target', 'query_packs', 'plugins', 'output'], `${label} manifest`);
    requiredFields(target, ['schema_version', 'target_id', 'name', 'primary_url', 'platform'], `${label} target manifest`);
    requiredFields(workspace, ['schema_version', 'workspace_id', 'name', 'generation', 'targets', 'evaluations', 'query_packs'], `${label} workspace manifest`);
    assert(['GEN-013', 'GEN-014'].includes(evaluation.generation), `${label} must run under a known generation (GEN-013 or GEN-014).`);
    assert(target.platform.expected === 'shopify', `${label} target should declare an expected platform (Shopify in the first slice).`);
    assert(queryPacks.length > 0, `${label} must include at least one query pack.`);

    for (const pack of queryPacks) {
      requiredFields(pack, ['schema_version', 'query_pack_id', 'domain', 'queries'], `Query pack ${pack.query_pack_id || '<unknown>'}`);
      assert(Array.isArray(pack.queries) && pack.queries.length >= 5, `Query pack ${pack.query_pack_id} must include at least five starter queries.`);
      for (const query of pack.queries) {
        requiredFields(query, ['query_id', 'query', 'intent', 'provenance'], `Query ${query.query_id || '<unknown>'}`);
      }
    }

    for (const pluginId of evaluation.plugins) {
      const metadata = readPluginMetadata(pluginId);
      requiredFields(metadata, ['plugin_id', 'surface', 'version', 'depends_on', 'consumes', 'produces'], `Plugin ${pluginId}`);
      assert(metadata.plugin_id === pluginId, `Plugin metadata ID mismatch for ${pluginId}.`);
    }

    const pluginGraph = buildPluginGraph(evaluation.plugins);
    assert(pluginGraph.execution_order.length === evaluation.plugins.length, `${label} plugin graph did not include every plugin.`);
  }
}

function validatePlatform() {
  const registry = readJson('platform/capability-registry.json');
  const dependencyGraph = readJson('platform/capability-dependency-graph.json');
  const suite = readJson('platform/validation-suite.json');
  const maturity = readJson('platform/capability-maturity.json');

  assert((registry.capabilities || []).length >= 9, 'Capability registry should include the first GEN-013 capability set.');
  const ids = new Set(registry.capabilities.map((capability) => capability.capability_id));
  for (const entry of dependencyGraph.dependencies || []) {
    assert(ids.has(entry.capability_id), `Capability dependency graph references unknown capability ${entry.capability_id}.`);
    for (const dependency of entry.depends_on || []) {
      assert(ids.has(dependency), `Capability ${entry.capability_id} depends on unknown capability ${dependency}.`);
    }
  }
  for (const validator of suite.validators || []) {
    assert(ids.has(validator.capability_id), `Validation suite references unknown capability ${validator.capability_id}.`);
  }
  for (const level of maturity.levels || []) {
    for (const capabilityId of level.capabilities || []) {
      assert(ids.has(capabilityId), `Maturity level ${level.level} references unknown capability ${capabilityId}.`);
    }
  }

  const rendered = registry.capabilities.find((capability) => capability.capability_id === 'P008');
  assert(rendered?.status === 'planned', 'Rendered capture should remain a platform capability gap in the first slice.');
}

function latestInspectionDir() {
  return latestDirectory('assessments/ridge/inspection-report/GEN-013');
}

function validateInspectionRun(runDir = latestInspectionDir()) {
  if (!runDir) {
    warnings.push('No run-specific inspection output exists yet. Run npm run inspect:ridge to validate generated artifacts.');
    return;
  }

  const required = [
    'run-manifest.json',
    'platform-capability-report.json',
    'site-profile.json',
    'raw/http/site-profile-endpoints.json',
    'plugin-dependency-graph.json',
    'plugin-state.json',
    'checkpoint.json',
    'artifact-index.json',
    'inspection-model.json',
    'dashboard.json',
    'dashboard.html',
    'inspection-report.json',
    'inspection-report.md',
    'evidence/timeline.jsonl',
    'evidence/experiments/submitted-search.jsonl',
    'evidence/experiments/autocomplete.jsonl'
  ];

  for (const file of required) {
    requireFile(path.join(runDir, file));
  }

  const report = readJson(path.join(runDir, 'inspection-report.json'));
  const generatedDatasets = Object.entries(report.datasets || {}).filter(([, dataset]) => dataset.status === 'generated');
  for (const [datasetId, dataset] of generatedDatasets) {
    assert(exists(dataset.path), `Generated dataset ${datasetId} is missing its file: ${dataset.path}`);
  }
  const dashboard = readJson(path.join(runDir, 'dashboard.json'));
  const checkpoint = readJson(path.join(runDir, 'checkpoint.json'));
  const artifactIndex = readJson(path.join(runDir, 'artifact-index.json'));
  const platformReport = readJson(path.join(runDir, 'platform-capability-report.json'));
  const dashboardHtml = fs.readFileSync(path.join(runDir, 'dashboard.html'), 'utf8');
  const timeline = readJsonl(path.join(runDir, 'evidence/timeline.jsonl'));
  // Downstream interpretation artifacts (executive reports) are written into
  // the run dir after inspection completes; they are not inspection artifacts
  // and are excluded from the artifact index consistency check.
  const files = listFilesRecursive(runDir).filter((file) => !file.includes(`${path.sep}executive${path.sep}`));

  requiredFields(report, ['schema_version', 'inspection_id', 'dashboard', 'crawl_health', 'site_discovery', 'datasets', 'limitations', 'artifact_explorer'], 'Inspection report');
  assert(report.schema_version === 'inspection-report-v0.1', 'Inspection report schema version mismatch.');
  assert(/^GEN-\d{3}-/.test(report.inspection_id), 'Inspection ID should include generation and timestamp.');
  assert(report.dashboard.purpose_question.includes('trust this inspection'), 'Dashboard purpose question missing trust framing.');
  assert(Array.isArray(report.crawl_health) && report.crawl_health.length >= 9, 'Crawl health must include the mission dashboard components.');
  assert(Object.keys(report.datasets || {}).length === 4, 'Inspection report must include DS1-DS4 dataset summaries.');
  assert(report.limitations.platform_capability_gaps.length >= 1, 'First slice should record rendered capture as a platform capability gap.');
  assert(Array.isArray(report.limitations.commerce_observations), 'Commerce observations must be separated from infrastructure/platform limitations.');
  assert(platformReport.platform_gap_classification_rule.includes('must not be emitted as ecommerce findings'), 'Platform gap classification rule missing.');
  assert(checkpoint.status === 'complete', 'Checkpoint should be complete after a full run.');
  assert(artifactIndex.artifact_count === files.length || artifactIndex.artifact_count === files.length - 1, 'Artifact index count is inconsistent with run files.');
  assert(timeline.some((entry) => entry.event === 'inspection_started'), 'Timeline missing inspection_started event.');
  assert(timeline.some((entry) => entry.event === 'inspection_completed'), 'Timeline missing inspection_completed event.');
  assert(dashboard.artifact_explorer.evidence.length >= 2, 'Dashboard artifact explorer should expose plugin evidence files.');
  assert(dashboard.artifact_explorer.datasets.length >= generatedDatasets.length, 'Dashboard artifact explorer should expose every generated dataset file.');
  assert(dashboardHtml.includes('Inspection Dashboard'), 'Static dashboard HTML missing Inspection Dashboard title.');
  assert(dashboardHtml.includes('Report Readiness'), 'Static dashboard HTML missing Report Readiness section.');
  assert(dashboardHtml.includes('Artifact Explorer'), 'Static dashboard HTML missing Artifact Explorer section.');

  const reportText = readJson(path.join(runDir, 'inspection-report.json'));
  const serialized = JSON.stringify(reportText).toLowerCase();
  for (const disallowed of ['quick win', 'revenue estimate', 'business impact', 'recommended action', 'priority recommendation']) {
    assert(!serialized.includes(disallowed), `Inspection report contains interpretation language: ${disallowed}`);
  }

  const cacheMetadataPath = path.join(runDir, 'cache-metadata.json');
  if (exists(cacheMetadataPath)) {
    const cacheMetadata = readJson(cacheMetadataPath);
    const contracts = readJson('schemas/inspection/contracts.json');
    requiredFields(cacheMetadata, contracts.contracts.cache_metadata.required, 'Cache metadata');
    assert(
      ['reused_run_checkpoint', 'reused_shared_cache', 'refreshed_live_discovery'].includes(cacheMetadata.decision),
      `Cache metadata has unknown decision: ${cacheMetadata.decision}`
    );
  } else {
    warnings.push(`Run ${runDir} predates cache metadata evidence; rerun to record the site profile cache decision.`);
  }
}

function main() {
  const mode = process.argv[2] || 'all';
  if (mode === 'contracts' || mode === 'all') validateJsonContracts();
  if (mode === 'manifests' || mode === 'all') validateManifests();
  if (mode === 'platform' || mode === 'all') validatePlatform();
  if (mode === 'inspection' || mode === 'all') validateInspectionRun(process.argv[3]);

  for (const warning of warnings) {
    console.warn(`WARN: ${warning}`);
  }
  if (failures.length > 0) {
    console.error(`GEN-013 validation failed with ${failures.length} issue(s):`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log(`GEN-013 validation passed (${mode}).`);
}

main();
