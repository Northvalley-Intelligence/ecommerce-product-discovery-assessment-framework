#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, listFilesRecursive, readJson, readJsonl, writeText } from '../lib/fs-json.mjs';
import { previewCleanup, runCleanup } from './cleanup.mjs';
import { InspectionQueue } from './inspection-queue.mjs';
import { retryCapture } from './retry-capture.mjs';
import { loadInspectionConfig, saveInspectionConfig } from './inspection-config.mjs';
import { curateQueryPack } from './curate-query-pack.mjs';
import { generateFixPlan, readFixPlan, verifyFixPlan } from './fix-plan.mjs';
import { generateExecutiveReport } from './generate-executive-report.mjs';
import { onboardTarget } from './onboard-target.mjs';
import { createWooCommerceAdapter } from '../adapters/woocommerce.mjs';
import { latexmkAvailable, renderExecutivePdf } from './render-executive-pdf.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;

const DATASET_ROOT_GROUPS = [
  { id: 'evaluations', label: 'Evaluations', dir: 'evaluations' },
  { id: 'targets', label: 'Targets', dir: 'targets' },
  { id: 'query-packs', label: 'Query Packs', dir: 'query-packs' },
  { id: 'site-profiles', label: 'Site Profiles', dir: 'site-profiles' },
  { id: 'platform', label: 'Platform Registries', dir: 'platform' },
  { id: 'inspection-history', label: 'Inspection History', dir: 'inspection-history' }
];
const DATASET_EXTENSIONS = new Set(['.json', '.jsonl']);
const DATASET_MAX_BYTES = 8 * 1024 * 1024;
const DATASET_RECORD_LIMIT = 1000;
const DATASET_FIELD_SCAN_LIMIT = 500;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    rootDir: process.cwd()
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--host') {
      args.host = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--port') {
      args.port = Number(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--root') {
      args.rootDir = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(html);
}

function sendText(response, statusCode, value) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(value);
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.jsonl')) return 'application/x-ndjson; charset=utf-8';
  if (filePath.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (filePath.endsWith('.pdf')) return 'application/pdf';
  if (filePath.endsWith('.tex')) return 'text/plain; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'text/plain; charset=utf-8';
}

function safeResolve(rootDir, requestedPath) {
  const resolved = path.resolve(rootDir, requestedPath || '');
  const root = path.resolve(rootDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Requested path is outside the project.');
  }
  return resolved;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function latestHistoryRows(rootDir) {
  const historyDir = path.join(rootDir, 'inspection-history');
  const rows = listFilesRecursive(historyDir)
    .filter((file) => file.endsWith('.jsonl'))
    .flatMap((file) => readJsonl(file))
    // A run whose directory was removed by cleanup must not appear as a
    // phantom entry; the index can lag disk, so gate on the run existing.
    .filter((row) => row.output_dir && exists(path.join(rootDir, row.output_dir)));
  return rows.sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

// Identified sites are target manifests that have an evaluation. They persist
// through run cleanup, so the operator keeps their Shopify site list even with
// zero runs, and can re-inspect any of them.
function listSites(rootDir) {
  const targetsDir = path.join(rootDir, 'targets');
  const evaluationsDir = path.join(rootDir, 'evaluations');
  if (!exists(targetsDir) || !exists(evaluationsDir)) return [];
  const evaluations = fs.readdirSync(evaluationsDir).filter((name) => name.endsWith('.json'))
    .map((name) => ({ file: name, ...readJson(path.join(evaluationsDir, name)) }));
  const historyRows = latestHistoryRows(rootDir);
  // Sector membership per site, so the sidebar can group sites by sector.
  const sectorsByTarget = new Map();
  for (const sector of listSectors(rootDir)) {
    for (const targetId of sector.member_sites || []) {
      if (!sectorsByTarget.has(targetId)) sectorsByTarget.set(targetId, []);
      sectorsByTarget.get(targetId).push({ sector_id: sector.sector_id, name: sector.name });
    }
  }
  const sites = [];
  for (const file of fs.readdirSync(targetsDir).filter((name) => name.endsWith('.json'))) {
    const target = readJson(path.join(targetsDir, file));
    const platform = target.platform?.expected || 'shopify';
    const evaluation = evaluations.find((entry) => entry.target === path.join('targets', file));
    // Shopify sites require an evaluation (their inspection is evaluation-driven);
    // WooCommerce sites are listed directly (their catalog/search/autocomplete
    // come from the Store API, not an evaluation manifest).
    if (!evaluation && platform !== 'woocommerce') continue;
    const latest = historyRows.find((row) => row.target_id === target.target_id) || null;
    sites.push({
      target_id: target.target_id,
      name: target.name,
      url: target.primary_url,
      platform,
      evaluation: evaluation ? path.join('evaluations', evaluation.file) : null,
      latest_run_id: latest?.inspection_id || null,
      latest_status: latest?.status || null,
      latest_timestamp: latest?.timestamp || null,
      sectors: sectorsByTarget.get(target.target_id) || []
    });
  }
  return sites.sort((left, right) => left.name.localeCompare(right.name));
}

function loadRun(rootDir, runDir) {
  const resolvedRunDir = safeResolve(rootDir, runDir);
  const relativeRunDir = path.relative(rootDir, resolvedRunDir);
  const reportPath = path.join(resolvedRunDir, 'inspection-report.json');
  const dashboardPath = path.join(resolvedRunDir, 'dashboard.json');
  const checkpointPath = path.join(resolvedRunDir, 'checkpoint.json');
  const pluginStatePath = path.join(resolvedRunDir, 'plugin-state.json');
  const artifactIndexPath = path.join(resolvedRunDir, 'artifact-index.json');
  const timelinePath = path.join(resolvedRunDir, 'evidence', 'timeline.jsonl');
  const runManifestPath = path.join(resolvedRunDir, 'run-manifest.json');
  const executiveJsonPath = path.join(resolvedRunDir, 'executive', 'executive-report.json');
  const executiveMdPath = path.join(resolvedRunDir, 'executive', 'executive-report.md');
  const executivePdfPath = path.join(resolvedRunDir, 'executive', 'executive-report.pdf');

  const runReport = exists(reportPath) ? readJson(reportPath) : null;
  const fixPlan = runReport?.target?.target_id ? readFixPlan(rootDir, runReport.target.target_id) : null;

  return {
    run_dir: relativeRunDir,
    fix_plan: fixPlan
      ? {
          target_id: runReport.target.target_id,
          path: path.relative(rootDir, path.join(rootDir, 'assessments', runReport.target.target_id, 'fix-plan.json')),
          open_items: fixPlan.open_items,
          verified_items: fixPlan.verified_items,
          updated_from_inspection: fixPlan.updated_from_inspection,
          last_verification_inspection: fixPlan.last_verification_inspection || null,
          items: (fixPlan.items || []).map((item) => ({
            status: item.status,
            severity: item.severity,
            surface: item.surface,
            query: item.query,
            recommendation: item.recommendation
          }))
        }
      : null,
    executive_report: exists(executiveJsonPath)
      ? {
          json_path: path.relative(rootDir, executiveJsonPath),
          md_path: path.relative(rootDir, executiveMdPath),
          pdf_path: exists(executivePdfPath) ? path.relative(rootDir, executivePdfPath) : null
        }
      : null,
    report: runReport,
    dashboard: exists(dashboardPath) ? readJson(dashboardPath) : null,
    checkpoint: exists(checkpointPath) ? readJson(checkpointPath) : null,
    plugin_state: exists(pluginStatePath) ? readJson(pluginStatePath) : null,
    artifact_index: exists(artifactIndexPath) ? readJson(artifactIndexPath) : null,
    timeline: exists(timelinePath) ? readJsonl(timelinePath) : [],
    run_manifest: exists(runManifestPath) ? readJson(runManifestPath) : null
  };
}

function inspections(rootDir) {
  return latestHistoryRows(rootDir).map((row) => {
    const run = loadRun(rootDir, row.output_dir);
    return {
      ...row,
      readiness: run.dashboard?.operational_summary?.downstream_report_readiness || 'unknown',
      platform: run.dashboard?.crawl_summary?.platform_detection?.platform || 'unknown',
      failed_components: (run.dashboard?.crawl_health || []).filter((entry) => entry.status === 'FAIL').length,
      warning_components: (run.dashboard?.crawl_health || []).filter((entry) => entry.status === 'WARN').length
    };
  });
}

function datasetFileEntry(rootDir, filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: path.relative(rootDir, filePath),
    name: path.basename(filePath),
    format: filePath.endsWith('.jsonl') ? 'jsonl' : 'json',
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString()
  };
}

function datasetFilesIn(rootDir, dirPath) {
  return listFilesRecursive(dirPath)
    .filter((file) => DATASET_EXTENSIONS.has(path.extname(file)))
    .sort()
    .map((file) => datasetFileEntry(rootDir, file));
}

function datasetCatalog(rootDir) {
  const groups = DATASET_ROOT_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    files: datasetFilesIn(rootDir, path.join(rootDir, group.dir))
  }));
  const runFiles = latestHistoryRows(rootDir).flatMap((row) =>
    datasetFilesIn(rootDir, path.join(rootDir, row.output_dir, 'evidence', 'datasets')).map((file) => ({
      ...file,
      inspection_id: row.inspection_id,
      target_name: row.target_name
    }))
  );
  groups.push({
    id: 'run-datasets',
    label: 'Generated Run Datasets (DS1-DS4)',
    files: runFiles
  });
  return { groups };
}

// --- Site-scoped data (GEN-023) -------------------------------------------
// Every dataset traces to a site except the platform capability model and
// sector datasets, which are shared. These helpers group a site's data
// together (manifest, evaluation, query packs, site profile, per-run DS1-DS4)
// and expose the shared/sector layer separately, so connections stay visible.

function siteDomain(target) {
  try {
    return new URL(target.primary_url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function sectorSlug(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sector';
}

function listSectors(rootDir) {
  const dir = path.join(rootDir, 'sectors');
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => {
    const sector = readJson(path.join(dir, name));
    const packs = (sector.shared_query_packs || [])
      .filter((rel) => exists(path.join(rootDir, rel)))
      .map((rel) => datasetFileEntry(rootDir, path.join(rootDir, rel)));
    return { ...sector, path: path.join('sectors', name), query_pack_files: packs };
  });
}

function siteDatasets(rootDir, targetId) {
  const targetPath = path.join(rootDir, 'targets', `${targetId}.json`);
  if (!exists(targetPath)) return null;
  const target = readJson(targetPath);
  const domain = siteDomain(target);

  const groups = [];
  const pushGroup = (id, label, files) => { if (files.length) groups.push({ id, label, files }); };

  pushGroup('manifest', 'Target manifest', [datasetFileEntry(rootDir, targetPath)]);

  const evaluationsDir = path.join(rootDir, 'evaluations');
  const evaluationFiles = exists(evaluationsDir)
    ? fs.readdirSync(evaluationsDir).filter((name) => name.endsWith('.json'))
        .filter((name) => {
          const evaluation = readJson(path.join(evaluationsDir, name));
          return evaluation.target === path.join('targets', `${targetId}.json`);
        })
        .map((name) => datasetFileEntry(rootDir, path.join(evaluationsDir, name)))
    : [];
  pushGroup('evaluation', 'Evaluation baseline', evaluationFiles);

  const packsDir = path.join(rootDir, 'query-packs');
  const packFiles = exists(packsDir)
    ? fs.readdirSync(packsDir).filter((name) => name.endsWith('.json'))
        .filter((name) => {
          if (name === `${targetId}.json` || name.startsWith(`${targetId}-`)) return true;
          const pack = readJson(path.join(packsDir, name));
          return domain && pack.domain === domain;
        })
        .map((name) => datasetFileEntry(rootDir, path.join(packsDir, name)))
    : [];
  pushGroup('query-packs', 'Query packs', packFiles);

  const profileFiles = [];
  if (domain) {
    for (const candidate of [`${domain}.json`, `www.${domain}.json`]) {
      const profilePath = path.join(rootDir, 'site-profiles', candidate);
      if (exists(profilePath)) profileFiles.push(datasetFileEntry(rootDir, profilePath));
    }
  }
  pushGroup('site-profile', 'Site profile', profileFiles);

  const runs = latestHistoryRows(rootDir)
    .filter((row) => row.target_id === targetId)
    .map((row) => ({
      inspection_id: row.inspection_id,
      timestamp: row.timestamp,
      status: row.status,
      datasets: datasetFilesIn(rootDir, path.join(rootDir, row.output_dir, 'evidence', 'datasets'))
    }))
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));

  const sectors = listSectors(rootDir);
  return {
    target_id: targetId,
    name: target.name,
    domain,
    groups,
    runs,
    sector_membership: sectors.filter((sector) => (sector.member_sites || []).includes(targetId)),
    sectors_available: sectors.filter((sector) => !(sector.member_sites || []).includes(targetId))
  };
}

function siteHealth(rootDir, targetId) {
  const targetPath = path.join(rootDir, 'targets', `${targetId}.json`);
  if (!exists(targetPath)) return null;
  const target = readJson(targetPath);
  const runs = inspections(rootDir)
    .filter((row) => row.target_id === targetId)
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
  const latest = runs[0] || null;
  // Most recent run with no failed components is the last "clean" run.
  const lastClean = runs.find((row) => (row.failed_components || 0) === 0) || null;
  const plan = readFixPlan(rootDir, targetId);
  return {
    target_id: targetId,
    name: target.name,
    run_count: runs.length,
    inspected: runs.length > 0,
    latest: latest
      ? {
          inspection_id: latest.inspection_id,
          timestamp: latest.timestamp,
          status: latest.status,
          readiness: latest.readiness,
          coverage: latest.evidence_coverage,
          confidence: latest.overall_confidence,
          evidence_quality: latest.evidence_quality,
          failed_components: latest.failed_components,
          warning_components: latest.warning_components
        }
      : null,
    last_clean: lastClean ? { inspection_id: lastClean.inspection_id, timestamp: lastClean.timestamp } : null,
    fix_plan: plan
      ? { open_items: plan.open_items || 0, verified_items: plan.verified_items || 0, updated_from_inspection: plan.updated_from_inspection || null }
      : null,
    // Coverage across runs, oldest -> newest, for a simple trend.
    coverage_trend: runs
      .slice()
      .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
      .map((row) => ({ inspection_id: row.inspection_id, timestamp: row.timestamp, coverage: row.evidence_coverage }))
  };
}

// --- WooCommerce dashboard integration (GEN-029) --------------------------

function wooAdapterForTarget(rootDir, targetId) {
  const targetPath = path.join(rootDir, 'targets', `${targetId}.json`);
  if (!exists(targetPath)) return null;
  const target = readJson(targetPath);
  if ((target.platform?.expected || '') !== 'woocommerce') return null;
  return createWooCommerceAdapter(target);
}

// Latest cached catalog-summary.json from a woo-inspect capture, if any.
function latestWooCatalog(rootDir, targetId) {
  const captureRoot = path.join(rootDir, 'assessments', targetId, 'woo-inspection');
  if (!exists(captureRoot)) return null;
  const runs = fs.readdirSync(captureRoot).filter((name) => exists(path.join(captureRoot, name, 'catalog-summary.json'))).sort();
  if (!runs.length) return null;
  return readJson(path.join(captureRoot, runs[runs.length - 1], 'catalog-summary.json'));
}

function sharedData(rootDir) {
  const platformDir = path.join(rootDir, 'platform');
  return {
    platform: exists(platformDir) ? datasetFilesIn(rootDir, platformDir) : [],
    sectors: listSectors(rootDir)
  };
}

function sectorView(rootDir, sectorId) {
  const sectorPath = path.join(rootDir, 'sectors', `${sectorSlug(sectorId)}.json`);
  if (!exists(sectorPath)) return null;
  const sector = readJson(sectorPath);
  const packs = (sector.shared_query_packs || [])
    .filter((rel) => exists(path.join(rootDir, rel)))
    .map((rel) => datasetFileEntry(rootDir, path.join(rootDir, rel)));
  const sites = listSites(rootDir);
  const inspectionRows = inspections(rootDir);
  // One comparison row per member site, from its latest run on disk (or null).
  const members = (sector.member_sites || []).map((targetId) => {
    const site = sites.find((entry) => entry.target_id === targetId);
    const runs = inspectionRows
      .filter((row) => row.target_id === targetId)
      .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
    const latest = runs[0] || null;
    return {
      target_id: targetId,
      name: site?.name || targetId,
      url: site?.url || null,
      run_count: runs.length,
      latest_run: latest
        ? {
            inspection_id: latest.inspection_id,
            timestamp: latest.timestamp,
            status: latest.status,
            readiness: latest.readiness,
            coverage: latest.evidence_coverage,
            failed_components: latest.failed_components,
            warning_components: latest.warning_components,
            platform: latest.platform
          }
        : null
    };
  });
  return {
    sector_id: sector.sector_id,
    name: sector.name,
    description: sector.description || '',
    query_pack_files: packs,
    member_count: members.length,
    members
  };
}

function writeSector(rootDir, sector) {
  const dir = path.join(rootDir, 'sectors');
  if (!exists(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sector.sector_id}.json`), JSON.stringify(sector, null, 2) + '\n');
  return sector;
}

function promoteToSector(rootDir, { target_id, dataset_path, sector_name }) {
  if (!target_id || !dataset_path || !sector_name) throw new Error('target_id, dataset_path, and sector_name are required.');
  // Only query packs are reusable across sites; manifests, profiles, and run
  // datasets are intrinsically site-specific and are not promotable.
  const normalized = path.relative(rootDir, safeResolve(rootDir, dataset_path));
  if (!normalized.startsWith('query-packs' + path.sep) && normalized !== path.join('query-packs')) {
    throw new Error('Only query packs can be promoted to sector data.');
  }
  if (!exists(path.join(rootDir, normalized))) throw new Error(`Dataset not found: ${dataset_path}`);
  const slug = sectorSlug(sector_name);
  const sectorPath = path.join(rootDir, 'sectors', `${slug}.json`);
  const sector = exists(sectorPath)
    ? readJson(sectorPath)
    : { schema_version: 'sector-v0.1', sector_id: slug, name: sector_name, shared_query_packs: [], member_sites: [], created_from: { target_id, dataset: normalized } };
  sector.shared_query_packs = Array.from(new Set([...(sector.shared_query_packs || []), normalized]));
  sector.member_sites = Array.from(new Set([...(sector.member_sites || []), target_id]));
  return writeSector(rootDir, sector);
}

function adoptSector(rootDir, { target_id, sector_id }) {
  if (!target_id || !sector_id) throw new Error('target_id and sector_id are required.');
  const sectorPath = path.join(rootDir, 'sectors', `${sectorSlug(sector_id)}.json`);
  if (!exists(sectorPath)) throw new Error(`Sector not found: ${sector_id}`);
  const sector = readJson(sectorPath);
  sector.member_sites = Array.from(new Set([...(sector.member_sites || []), target_id]));
  return writeSector(rootDir, sector);
}

function normalizeDatasetRecords(value) {
  if (Array.isArray(value)) {
    return { records: value, meta: null };
  }
  const arrayFields = Object.entries(value)
    .filter(([, field]) => Array.isArray(field) && field.length >= 2 && field.every((item) => item && typeof item === 'object'))
    .sort((left, right) => right[1].length - left[1].length);
  if (arrayFields.length === 0) {
    return { records: [value], meta: null };
  }
  const [recordField, records] = arrayFields[0];
  const manifest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== recordField));
  return { records, meta: { record_field: recordField, manifest } };
}

function loadDataset(rootDir, requestedPath, limit) {
  if (!requestedPath) throw new Error('path query parameter is required.');
  const filePath = safeResolve(rootDir, requestedPath);
  if (!DATASET_EXTENSIONS.has(path.extname(filePath))) {
    throw new Error('Dataset viewer only reads .json and .jsonl files.');
  }
  if (!exists(filePath) || fs.statSync(filePath).isDirectory()) return null;
  const stat = fs.statSync(filePath);
  if (stat.size > DATASET_MAX_BYTES) {
    throw new Error(`Dataset is larger than ${Math.round(DATASET_MAX_BYTES / (1024 * 1024))} MB; open it through the artifact route instead.`);
  }
  const format = filePath.endsWith('.jsonl') ? 'jsonl' : 'json';
  const { records: rawRecords, meta } = format === 'jsonl'
    ? { records: readJsonl(filePath), meta: null }
    : normalizeDatasetRecords(readJson(filePath));
  const records = rawRecords.map((record) =>
    record && typeof record === 'object' && !Array.isArray(record) ? record : { value: record }
  );
  const fields = [];
  const seenFields = new Set();
  for (const record of records.slice(0, DATASET_FIELD_SCAN_LIMIT)) {
    for (const key of Object.keys(record)) {
      if (!seenFields.has(key)) {
        seenFields.add(key);
        fields.push(key);
      }
    }
  }
  const recordLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, DATASET_RECORD_LIMIT) : DATASET_RECORD_LIMIT;
  return {
    path: path.relative(rootDir, filePath),
    format,
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    record_count: records.length,
    returned_count: Math.min(records.length, recordLimit),
    truncated: records.length > recordLimit,
    fields,
    meta,
    records: records.slice(0, recordLimit)
  };
}

function runChild(rootDir, args, logName) {
  ensureDir(path.join(rootDir, 'tmp', 'dashboard-runs'));
  const logPath = path.join(rootDir, 'tmp', 'dashboard-runs', logName);
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  child.on('close', (code) => {
    logStream.write(`\n[dashboard] process exited with code ${code}\n`);
    logStream.end();
  });
  return {
    pid: child.pid,
    log_path: path.relative(rootDir, logPath)
  };
}

function compareRuns(rootDir, leftDir, rightDir) {
  const left = loadRun(rootDir, leftDir);
  const right = loadRun(rootDir, rightDir);
  const leftHealth = new Map((left.report?.crawl_health || []).map((entry) => [entry.component, entry]));
  const rightHealth = new Map((right.report?.crawl_health || []).map((entry) => [entry.component, entry]));
  const components = [...new Set([...leftHealth.keys(), ...rightHealth.keys()])].sort();
  return {
    left: {
      inspection_id: left.report?.inspection_id,
      run_dir: left.run_dir,
      status: left.dashboard?.crawl_summary?.overall_inspection_status,
      readiness: left.dashboard?.operational_summary?.downstream_report_readiness,
      coverage: left.dashboard?.evidence_coverage?.component_coverage_percent
    },
    right: {
      inspection_id: right.report?.inspection_id,
      run_dir: right.run_dir,
      status: right.dashboard?.crawl_summary?.overall_inspection_status,
      readiness: right.dashboard?.operational_summary?.downstream_report_readiness,
      coverage: right.dashboard?.evidence_coverage?.component_coverage_percent
    },
    crawl_health_delta: components.map((component) => ({
      component,
      left_status: leftHealth.get(component)?.status || 'NOT_RUN',
      right_status: rightHealth.get(component)?.status || 'NOT_RUN',
      changed: (leftHealth.get(component)?.status || 'NOT_RUN') !== (rightHealth.get(component)?.status || 'NOT_RUN')
    }))
  };
}

function dashboardPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ecommerce Inspection Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5f6b7a;
      --line: #d9dee7;
      --blue: #245c9d;
      --green: #187348;
      --amber: #986400;
      --red: #b42318;
      --soft-blue: #e8f1fb;
      --soft-green: #e7f5ee;
      --soft-amber: #fff4d8;
      --soft-red: #fde8e5;
      --soft-gray: #eef1f5;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.42;
    }
    button, input, select {
      font: inherit;
    }
    button {
      border: 1px solid var(--blue);
      background: var(--blue);
      color: white;
      border-radius: 6px;
      padding: 9px 12px;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: white;
      color: var(--blue);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    input, select {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      width: 100%;
      background: white;
      color: var(--text);
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr);
    }
    aside {
      background: var(--panel);
      border-right: 1px solid var(--line);
      padding: 20px;
      overflow: auto;
      max-height: 100vh;
      position: sticky;
      top: 0;
    }
    main {
      padding: 24px;
      min-width: 0;
    }
    .brand {
      margin-bottom: 20px;
    }
    .eyebrow {
      margin: 0 0 4px;
      color: var(--blue);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    h1, h2, h3 {
      letter-spacing: 0;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.14;
    }
    h2 {
      margin: 0;
      font-size: 18px;
    }
    h3 {
      margin: 0 0 10px;
      font-size: 14px;
    }
    .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .run-list {
      display: grid;
      gap: 8px;
    }
    .sites-list { display: grid; gap: 6px; margin-bottom: 10px; }
    .list-head { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--muted); margin: 6px 0 2px; }
    .site-group { display: grid; gap: 6px; margin-bottom: 12px; }
    .site-group-head { width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; color: var(--blue); text-transform: uppercase; margin: 4px 0 0; padding: 2px 0; }
    .site-group-head:hover { text-decoration: underline; }
    .group-caret { display: inline-block; width: 10px; color: var(--muted); }
    .sort-control { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; }
    .sort-control label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); }
    .sort-control select { flex: 1; padding: 5px 7px; border: 1px solid var(--line); border-radius: 7px; font: inherit; font-size: 12px; }
    .site-nav { width: 100%; text-align: left; display: grid; gap: 2px; border: 1px solid var(--line); background: white; color: var(--text); border-radius: 8px; padding: 9px 11px; }
    .site-nav.active { border-color: var(--blue); background: var(--soft-blue); }
    .site-name { font-weight: 800; overflow-wrap: anywhere; }
    .run-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
    .run-card { text-align: left; display: grid; gap: 4px; border: 1px solid var(--line); background: white; color: var(--text); border-radius: 8px; padding: 11px 12px; }
    .run-card:hover { border-color: var(--blue); background: var(--soft-blue); }
    .run-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .crumb-current { font-weight: 700; font-size: 13px; }
    .crumb-sep { color: var(--muted); margin: 0 6px; }
    .data-group { margin: 0 0 16px; }
    .data-group h3 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
    .data-files { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
    .data-file { text-align: left; display: grid; gap: 2px; border: 1px solid var(--line); background: white; color: var(--text); border-radius: 8px; padding: 8px 10px; cursor: pointer; }
    .data-file:hover { border-color: var(--blue); background: var(--soft-blue); }
    .data-file .file-name { font-weight: 600; font-size: 13px; word-break: break-word; }
    .data-file small { color: var(--muted); font-size: 11px; }
    .data-run { margin: 0 0 10px; }
    .sector-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 8px; }
    .promote-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .promote-row select, .promote-row input { padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; font: inherit; }
    .link-btn { background: none; border: none; color: var(--blue); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
    .run-item {
      width: 100%;
      display: grid;
      gap: 5px;
      text-align: left;
      border: 1px solid var(--line);
      background: white;
      color: var(--text);
      border-radius: 8px;
      padding: 11px;
    }
    .run-item.active {
      border-color: var(--blue);
      background: var(--soft-blue);
    }
    .run-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }
    .run-title {
      font-weight: 800;
    }
    .status {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
      text-transform: uppercase;
    }
    .pass { background: var(--soft-green); color: var(--green); border: 1px solid #9bd6b6; }
    .warn { background: var(--soft-amber); color: var(--amber); border: 1px solid #e5c46f; }
    .fail { background: var(--soft-red); color: var(--red); border: 1px solid #f0a19a; }
    .muted-status { background: var(--soft-gray); color: var(--muted); border: 1px solid var(--line); }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) 180px auto auto auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 16px;
    }
    .field label {
      display: block;
      margin-bottom: 5px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .hero-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .page-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .setup-form {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      max-width: 640px;
    }
    .setup-form .field { margin-bottom: 16px; }
    .checkbox-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 6px;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
    }
    .checkbox-row input { width: auto; }
    .checkbox-row label { margin: 0; text-transform: none; font-weight: 600; color: var(--text); font-size: 13px; }
    .setup-actions { display: flex; gap: 10px; margin-top: 8px; }
    .tl-attention {
      background: var(--soft-red);
      border: 1px solid #f0a19a;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 16px;
    }
    .tl-attention-title { font-weight: 800; color: var(--red); font-size: 12px; text-transform: uppercase; margin-bottom: 6px; }
    .tl-attention ul { margin: 0; padding-left: 18px; }
    .tl-attention li { margin: 3px 0; font-size: 13px; }
    .tl-clear {
      background: var(--soft-green);
      border: 1px solid #9bd6b6;
      color: var(--green);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 13px;
      font-weight: 600;
    }
    .tl-stepper { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
    .tl-step { display: flex; align-items: center; gap: 6px; }
    .tl-node { width: 12px; height: 12px; border-radius: 999px; display: inline-block; }
    .tl-node.pass { background: var(--green); }
    .tl-node.warn { background: var(--amber); }
    .tl-node.fail { background: var(--red); }
    .tl-step-label { font-size: 12px; font-weight: 700; color: var(--muted); }
    .tl-connector { width: 18px; height: 2px; background: var(--line); }
    .tl-legend { display: flex; gap: 16px; margin-bottom: 14px; font-size: 12px; color: var(--muted); }
    .tl-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .tl-lanes { display: grid; gap: 12px; }
    .tl-lane { border: 1px solid var(--line); border-radius: 8px; padding: 11px 12px; }
    .tl-lane-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .tl-cells { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 5px; }
    .tl-cell { width: 15px; height: 15px; border-radius: 3px; display: inline-block; }
    .tl-cell.pass { background: var(--green); }
    .tl-cell.warn { background: var(--amber); }
    .tl-cell.fail { background: var(--red); }
    .tl-cell.muted-status { background: var(--line); }
    .detail-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 2px solid var(--line);
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .detail-tab {
      background: transparent;
      border: 0;
      border-bottom: 3px solid transparent;
      border-radius: 0;
      color: var(--muted);
      font-weight: 800;
      padding: 10px 14px;
      margin-bottom: -2px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .detail-tab.active { color: var(--blue); border-bottom-color: var(--blue); }
    .tab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      color: white;
    }
    .tab-badge.fail { background: var(--red); }
    .tab-badge.warn { background: var(--amber); }
    .status-link { cursor: pointer; border: 0; }
    .att-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 12px;
      margin-bottom: 8px;
      background: white;
    }
    .att-item[open] { background: #fbfcfd; }
    .att-item summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .att-item summary::-webkit-details-marker { display: none; }
    .att-dot { width: 9px; height: 9px; border-radius: 999px; flex: none; }
    .att-dot.fail { background: var(--red); }
    .att-dot.warn { background: var(--amber); }
    .att-item ul { margin: 8px 0 2px; padding-left: 26px; }
    .att-item li { font-size: 12px; margin: 3px 0; overflow-wrap: anywhere; }
    .att-item .att-goto { margin-left: auto; font-size: 12px; white-space: nowrap; }
    .retry-capture-btn { padding: 3px 9px; font-size: 11px; font-weight: 700; margin-left: 8px; }
    .crumb-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .crumb-link { font-weight: 700; font-size: 13px; }
    .crumb-back { padding: 6px 12px; font-size: 13px; }
    .chip-details { display: inline-block; }
    .chip-details summary { list-style: none; cursor: pointer; }
    .chip-details summary::-webkit-details-marker { display: none; }
    .chip-details summary.chip-active { background: var(--soft-amber); color: var(--amber); border-color: #e5c46f; }
    .chip-details[open] { display: block; width: 100%; }
    .chip-body { margin-top: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: #fbfcfd; }
    .chip-body ul { margin: 0 0 6px; padding-left: 20px; }
    .chip-body li { font-size: 12px; margin: 3px 0; overflow-wrap: anywhere; }
    .storage {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .storage-actions {
      display: grid;
      gap: 8px;
      margin-top: 8px;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 14px;
    }
    .subline {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric {
      min-height: 100px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .metric-value {
      margin-top: 9px;
      font-size: 22px;
      font-weight: 800;
      overflow-wrap: anywhere;
    }
    .metric-detail {
      margin-top: 7px;
      color: var(--muted);
      font-size: 12px;
    }
    .metric-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .spark { display: flex; align-items: flex-end; gap: 4px; height: 32px; margin-top: 6px; }
    .spark-bar { width: 14px; background: var(--blue); border-radius: 2px 2px 0 0; display: inline-block; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 14px;
      overflow: hidden;
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .panel-head span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .panel-body {
      padding: 14px 16px;
    }
    .readiness {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
    }
    .readiness-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .chip {
      padding: 7px 9px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--soft-gray);
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 11px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      background: #fbfcfd;
    }
    tr:last-child td { border-bottom: 0; }
    .table-wrap {
      overflow-x: auto;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .artifacts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .artifact-group {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 130px;
    }
    .artifact-group ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .artifact-group li {
      display: grid;
      gap: 2px;
    }
    .artifact-group small {
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 14px;
    }
    .log {
      white-space: pre-wrap;
      background: #111827;
      color: #f9fafb;
      padding: 12px;
      border-radius: 8px;
      max-height: 260px;
      overflow: auto;
      font-size: 12px;
    }
    .empty {
      color: var(--muted);
      padding: 12px 0;
    }
    .view-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
      margin-bottom: 14px;
    }
    .queue-strip {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .queue-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .queue-head strong { font-size: 13px; }
    .queue-row {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 0; border-top: 1px solid var(--line); font-size: 13px;
    }
    .queue-row .q-label { flex: 1; overflow-wrap: anywhere; }
    .queue-cancel { padding: 3px 9px; font-size: 11px; font-weight: 700; }
    .spin { display: inline-block; width: 9px; height: 9px; border-radius: 999px; background: var(--blue); }
    .tab {
      background: white;
      color: var(--muted);
      border: 1px solid var(--line);
      font-weight: 800;
    }
    .tab.active {
      background: var(--blue);
      color: white;
      border-color: var(--blue);
    }
    .dataset-nav {
      display: grid;
      gap: 14px;
    }
    .dataset-group h3 {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .dataset-group {
      display: block;
    }
    .dataset-files {
      display: grid;
      gap: 6px;
    }
    .dataset-file {
      width: 100%;
      display: grid;
      gap: 2px;
      text-align: left;
      border: 1px solid var(--line);
      background: white;
      color: var(--text);
      border-radius: 8px;
      padding: 9px 11px;
      font-weight: 400;
    }
    .dataset-file.active {
      border-color: var(--blue);
      background: var(--soft-blue);
    }
    .dataset-file .file-name {
      font-weight: 800;
      overflow-wrap: anywhere;
    }
    .dataset-file small {
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    .dataset-controls {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 220px;
      gap: 10px;
      align-items: end;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
    }
    .record-detail {
      border-top: 1px solid var(--line);
    }
    .record-detail pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    tr.record-row { cursor: pointer; }
    tr.record-row:hover td { background: var(--soft-blue); }
    tr.record-row.selected td { background: var(--soft-blue); }
    @media (max-width: 1180px) {
      .shell { grid-template-columns: 1fr; }
      aside { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--line); }
      .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .toolbar { grid-template-columns: 1fr 1fr; }
      .artifacts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 740px) {
      main, aside { padding: 14px; }
      .hero, .readiness { grid-template-columns: 1fr; flex-direction: column; }
      .metric-grid, .toolbar, .two-col, .artifacts { grid-template-columns: 1fr; }
      .readiness-stats { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <div class="brand">
        <p class="eyebrow">Operational Dashboard</p>
        <h1>Ecommerce Inspections</h1>
        <p class="muted">Run, review, debug, compare, and decide report readiness.</p>
      </div>
      <div class="view-tabs" role="tablist">
        <button id="tabInspections" class="tab active" role="tab">Sites</button>
        <button id="tabShared" class="tab" role="tab">Shared</button>
        <button id="tabSettings" class="tab" role="tab">Settings</button>
      </div>
      <div id="sitesList" class="sites-list"></div>
      <div class="run-list" id="runList"></div>
      <div class="dataset-nav" id="datasetNav" hidden></div>
    </aside>
    <main>
      <div id="inspectionView">
        <section class="page-actions">
          <button id="newInspectionBtn">+ New Inspection</button>
          <span class="muted">Add a Shopify store, or select an inspection to review, rerun, or edit its setup.</span>
        </section>
        <div id="queueStrip" class="queue-strip" hidden></div>
        <div id="actionResult" class="muted"></div>
        <div id="detail"></div>
      </div>
      <div id="datasetView" hidden></div>
      <div id="setupView" hidden></div>
      <div id="settingsView" hidden></div>
    </main>
  </div>
  <script>
    const state = {
      inspections: [],
      selected: null,
      view: 'inspections',
      catalog: null,
      dataset: null,
      datasetError: null,
      datasetPath: null,
      datasetQuery: '',
      datasetField: '',
      selectedRecordIndex: -1,
      detailTab: 'overview',
      selectedSite: null,
      sortSites: 'name',
      collapsedGroups: []
    };

    function cls(status) {
      const value = String(status || '').toLowerCase();
      if (['pass', 'complete', 'completed', 'ready', 'bounded', 'verified_fixed'].includes(value)) return 'pass';
      if (['warn', 'partial', 'limited', 'open'].includes(value)) return 'warn';
      if (['fail', 'failed', 'blocked', 'not_ready', 'still_failing', 'regressed'].includes(value)) return 'fail';
      return 'muted-status';
    }
    function pill(status, label) {
      return '<span class="status ' + cls(status) + '">' + escapeHtml((label != null ? label : String(status || 'unknown')).toUpperCase()) + '</span>';
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
    }
    function artifactHref(file) {
      return '/artifact?path=' + encodeURIComponent(file);
    }
    function datasetHash(file, origin) {
      // origin keeps the connection visible in the viewer breadcrumb:
      // 'site:<targetId>' when opened from a site, 'shared' from the Shared view.
      const from = origin || (state.selectedSite ? 'site:' + state.selectedSite : 'shared');
      return '#dataset=' + encodeURIComponent(file) + '&from=' + encodeURIComponent(from);
    }
    function isDatasetFile(file) {
      return typeof file === 'string' && (file.endsWith('.json') || file.endsWith('.jsonl'));
    }
    function evidenceLinks(file) {
      if (!file) return '';
      const raw = '<a href="' + artifactHref(file) + '" target="_blank">Raw</a>';
      return isDatasetFile(file) ? '<a href="' + datasetHash(file) + '">View</a> · ' + raw : raw;
    }
    function formatBytes(bytes) {
      if (!Number.isFinite(bytes)) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function parseHash() {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      if (params.has('dataset')) {
        return { view: 'dataset', path: params.get('dataset'), from: params.get('from') || 'shared' };
      }
      if (params.has('sector')) return { view: 'sector', id: params.get('sector') };
      if (hash === 'shared' || hash.startsWith('shared')) return { view: 'shared' };
      if (params.has('setup')) return { view: 'setup', target: params.get('setup') || null };
      if (hash === 'setup') return { view: 'setup', target: null };
      if (hash === 'settings') return { view: 'settings' };
      return { view: 'inspections', path: null };
    }
    async function api(path, options) {
      const response = await fetch(path, options);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }
    // Site-centric navigation: a Shopify site has inspection runs, and each run
    // has results. The sidebar lists sites; picking a site shows its runs;
    // picking a run shows its results — with a breadcrumb keeping the chain
    // (Sites > Site > Run) visible so every result traces to its inspection.
    async function refresh() {
      state.inspections = await api('/api/inspections');
      state.sites = await api('/api/sites');
      renderSitesNav();
      document.getElementById('runList').innerHTML = '';
      if (state.selected && state.inspections.some((run) => run.inspection_id === state.selected)) {
        await openRun(state.selected);
      } else if (state.selectedSite && state.sites.some((site) => site.target_id === state.selectedSite)) {
        renderSiteView(state.selectedSite);
      } else if (state.sites.length) {
        selectSite(state.sites[0].target_id);
      } else {
        document.getElementById('detail').innerHTML = '<div class="panel"><div class="panel-body">No Shopify sites yet. Use New Inspection to add one.</div></div>';
      }
    }
    async function renderSites() { state.sites = await api('/api/sites'); renderSitesNav(); }
    function inspectionCount(targetId) {
      return state.inspections.filter((run) => run.target_id === targetId).length;
    }
    function siteNavButton(site) {
      const count = inspectionCount(site.target_id);
      const sub = site.platform === 'woocommerce'
        ? 'woocommerce · catalog/search'
        : (count ? count + ' run' + (count === 1 ? '' : 's') + ' · latest ' + escapeHtml(site.latest_status || 'unknown') : 'not yet inspected');
      return '<button class="site-nav' + (site.target_id === state.selectedSite ? ' active' : '') + '" data-target="' + escapeHtml(site.target_id) + '">' +
        '<span class="site-name">' + escapeHtml(site.name) + '</span>' +
        '<span class="muted">' + sub + '</span>' +
      '</button>';
    }
    function sortSitesList(list) {
      const copy = list.slice();
      if (state.sortSites === 'recent') {
        return copy.sort((left, right) => String(right.latest_timestamp || '').localeCompare(String(left.latest_timestamp || '')));
      }
      if (state.sortSites === 'runs') {
        return copy.sort((left, right) => inspectionCount(right.target_id) - inspectionCount(left.target_id) || left.name.localeCompare(right.name));
      }
      return copy.sort((left, right) => left.name.localeCompare(right.name));
    }
    function renderSitesNav() {
      const el = document.getElementById('sitesList');
      const sites = state.sites || [];
      if (!sites.length) { el.innerHTML = ''; return; }
      // Group sites by sector; a site in multiple sectors appears under each,
      // and sites in no sector fall under "Other sites".
      const bySector = new Map();
      const ungrouped = [];
      for (const site of sites) {
        if (site.sectors && site.sectors.length) {
          for (const sector of site.sectors) {
            if (!bySector.has(sector.name)) bySector.set(sector.name, []);
            bySector.get(sector.name).push(site);
          }
        } else {
          ungrouped.push(site);
        }
      }
      const groups = [...bySector.entries()].sort((left, right) => left[0].localeCompare(right[0]));
      if (ungrouped.length) groups.push(['Other sites', ungrouped]);
      const sortControl = '<div class="sort-control"><label for="siteSort">Sort</label>' +
        '<select id="siteSort">' +
          ['name:Name', 'recent:Recently inspected', 'runs:Most runs'].map((opt) => {
            const [value, text] = opt.split(':');
            return '<option value="' + value + '"' + (state.sortSites === value ? ' selected' : '') + '>' + text + '</option>';
          }).join('') +
        '</select></div>';
      el.innerHTML = '<div class="list-head">Your Shopify sites (' + sites.length + ')</div>' + sortControl +
        groups.map(([label, groupSites]) => {
          const collapsed = state.collapsedGroups.includes(label);
          return '<div class="site-group">' +
            '<button class="site-group-head" data-group="' + escapeHtml(label) + '"><span class="group-caret">' + (collapsed ? '▸' : '▾') + '</span> ' + escapeHtml(label) + ' (' + groupSites.length + ')</button>' +
            (collapsed ? '' : sortSitesList(groupSites).map(siteNavButton).join('')) + '</div>';
        }).join('');
      for (const btn of el.querySelectorAll('.site-nav')) btn.addEventListener('click', () => selectSite(btn.dataset.target));
      for (const head of el.querySelectorAll('.site-group-head')) {
        head.addEventListener('click', () => {
          const label = head.dataset.group;
          const index = state.collapsedGroups.indexOf(label);
          if (index >= 0) state.collapsedGroups.splice(index, 1);
          else state.collapsedGroups.push(label);
          renderSitesNav();
        });
      }
      const sortSelect = document.getElementById('siteSort');
      if (sortSelect) sortSelect.addEventListener('change', (event) => { state.sortSites = event.target.value; renderSitesNav(); });
    }
    function highlightSite(targetId) {
      for (const btn of document.querySelectorAll('.site-nav')) btn.classList.toggle('active', btn.dataset.target === targetId);
    }
    function selectSite(targetId) {
      state.selectedSite = targetId;
      state.selected = null;
      highlightSite(targetId);
      renderSiteView(targetId);
    }
    function renderSiteView(targetId) {
      const site = (state.sites || []).find((entry) => entry.target_id === targetId);
      if (!site) return;
      if (site.platform === 'woocommerce') { renderWooSite(site); return; }
      const runs = state.inspections.filter((run) => run.target_id === targetId)
        .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
      document.getElementById('detail').innerHTML =
        '<div class="crumb-bar"><span class="crumb-current">Sites › ' + escapeHtml(site.name) + '</span></div>' +
        '<section class="hero"><div><p class="eyebrow">Shopify Site</p><h1>' + escapeHtml(site.name) + '</h1>' +
          '<div class="subline"><span>' + escapeHtml(site.url) + '</span><span>' + escapeHtml(site.platform) + '</span><span>' + runs.length + ' inspection run' + (runs.length === 1 ? '' : 's') + '</span></div>' +
          '<div class="hero-actions"><button id="siteInspectBtn" data-eval="' + escapeHtml(site.evaluation) + '" data-name="' + escapeHtml(site.name) + '">Inspect ' + escapeHtml(site.name) + '</button>' +
          '<button id="siteEditBtn" class="secondary" data-target="' + escapeHtml(targetId) + '">Edit setup</button></div>' +
        '</div></section>' +
        '<div id="siteHealth"><div class="empty">Loading health summary…</div></div>' +
        panel('Inspection Runs', 'Each run is one inspection of this site; open one to see its results', runs.length
          ? '<div class="panel-body"><div class="run-cards">' + runs.map((run) =>
              '<button class="run-card" data-id="' + escapeHtml(run.inspection_id) + '">' +
                '<div class="run-card-top"><strong>' + escapeHtml((run.timestamp || '').slice(0, 16).replace('T', ' ')) + '</strong>' + pill(run.status) + '</div>' +
                '<div class="muted mono">' + escapeHtml(run.inspection_id) + '</div>' +
                '<div class="muted">Readiness: ' + escapeHtml(run.readiness) + ' · Coverage: ' + escapeHtml(run.evidence_coverage) + '%</div>' +
              '</button>').join('') + '</div></div>'
          : '<div class="panel-body"><div class="empty">No inspections yet for this site. Click Inspect ' + escapeHtml(site.name) + ' to run one.</div></div>') +
        '<div id="siteData"><div class="empty">Loading data connected to this site…</div></div>';
      loadSiteHealth(targetId);
      loadSiteData(targetId);
      const inspectBtn = document.getElementById('siteInspectBtn');
      if (inspectBtn) inspectBtn.addEventListener('click', async () => {
        try {
          await api('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evaluation: inspectBtn.dataset.eval }) });
          document.getElementById('actionResult').textContent = 'Queued an inspection of ' + inspectBtn.dataset.name + '. Watch the run queue above.';
          pollQueue();
        } catch (error) { alert(error.message); }
      });
      const editBtn = document.getElementById('siteEditBtn');
      if (editBtn) editBtn.addEventListener('click', () => { window.location.hash = '#setup=' + encodeURIComponent(editBtn.dataset.target); });
      for (const card of document.querySelectorAll('.run-card')) card.addEventListener('click', () => openRun(card.dataset.id));
    }
    function renderWooSite(site) {
      const targetId = site.target_id;
      document.getElementById('detail').innerHTML =
        '<div class="crumb-bar"><span class="crumb-current">Sites › ' + escapeHtml(site.name) + '</span><span class="muted">— WooCommerce</span></div>' +
        '<section class="hero"><div><p class="eyebrow">WooCommerce Site</p><h1>' + escapeHtml(site.name) + '</h1>' +
          '<div class="subline"><span>' + escapeHtml(site.url) + '</span><span>woocommerce</span><span><a href="' + escapeHtml(site.url) + '" target="_blank" rel="noopener">Open store</a></span></div></div></section>' +
        '<div id="wooCatalog"><div class="empty">Loading catalog…</div></div>' +
        panel('Search', 'Live query against the store\\'s WooCommerce Store API',
          '<div class="panel-body"><div class="field" style="max-width:420px"><input id="wooSearchInput" placeholder="Search products (e.g. protein)"></div>' +
          '<div id="wooSearchResults" class="muted" style="margin-top:8px">Type a query to see live results.</div></div>') +
        panel('Autocomplete', 'Type-ahead prefix search (WooCommerce has no native autocomplete endpoint)',
          '<div class="panel-body"><div class="field" style="max-width:420px"><input id="wooAutoInput" placeholder="Start typing (e.g. wh)"></div>' +
          '<div id="wooAutoResults" class="muted" style="margin-top:8px">Start typing to see suggestions.</div></div>');
      loadWooCatalog(targetId);
      wireWooSearch(targetId);
    }
    async function loadWooCatalog(targetId) {
      let data;
      try { data = await api('/api/woo/catalog?target=' + encodeURIComponent(targetId)); }
      catch (error) { document.getElementById('wooCatalog').innerHTML = ''; return; }
      if (state.selectedSite !== targetId) return;
      const el = document.getElementById('wooCatalog');
      if (!el) return;
      if (!data.captured) {
        el.innerHTML = panel('Catalog summary', 'At a glance', '<div class="panel-body"><div class="empty">Not scanned yet — run woo-inspect for this store to populate the catalog.</div></div>');
        return;
      }
      const s = data.summary;
      const metrics =
        healthMetric('SKUs', escapeHtml(String(s.sku_count)), 'products (' + escapeHtml(s.sku_count_source || '') + ')') +
        healthMetric('Browse nodes', escapeHtml(String(s.browse_nodes)), s.browse_nodes_substantive + ' substantive · ' + s.browse_nodes_operational_heuristic + ' operational') +
        healthMetric('Browse levels', escapeHtml(String(s.browse_levels)), s.browse_levels <= 1 ? 'flat' : 'hierarchical') +
        healthMetric('Search signal', escapeHtml((s.search_signal && s.search_signal.literal_hits) || '—') + ' / ' + escapeHtml((s.search_signal && s.search_signal.intent_hits) || '—'), 'literal / intent hits');
      const topCats = (s.top_categories || []).slice(0, 8).map((category) =>
        '<tr><td>' + escapeHtml(category.name) + '</td><td>' + escapeHtml(String(category.count ?? '')) + '</td></tr>').join('');
      const surfaces = (s.surfaces || []).map((surface) =>
        '<tr><td><strong>' + escapeHtml(surface.surface) + '</strong></td>' +
        '<td>' + pill(surface.status, surface.status === 'limited' ? 'LIMITED' : null) + (surface.nature === 'capture_limitation' ? ' <span class="muted" style="font-size:11px">capture limit</span>' : '') + '</td>' +
        '<td class="muted" style="font-size:12px">' + escapeHtml(surface.detail) + '</td></tr>').join('');
      const facets = s.facets || null;
      const facetRows = facets && facets.top_facets ? facets.top_facets.slice(0, 8).map((facet) =>
        '<tr><td>' + escapeHtml(facet.name) + '</td><td>' + escapeHtml(String(facet.term_count)) + '</td><td class="muted" style="font-size:12px">' + escapeHtml((facet.top_terms || []).slice(0, 5).join(', ')) + '</td></tr>').join('') : '';
      const sevStatus = (severity) => ({ Critical: 'fail', High: 'fail', Medium: 'warn', Low: 'warn', Info: 'muted-status' }[severity] || 'warn');
      const health = s.health;
      const healthPanel = health ? panel('Health summary', s.findings ? s.findings.length + ' finding' + (s.findings.length === 1 ? '' : 's') + ' · ' + (s.fix_plan ? s.fix_plan.open_items : 0) + ' fix item' + ((s.fix_plan && s.fix_plan.open_items === 1) ? '' : 's') : '',
        '<div class="panel-body"><div class="metric-row">' +
          healthMetric('Readiness', pill(health.readiness), 'from surface coverage') +
          healthMetric('Surface coverage', escapeHtml(String(health.coverage_percent)) + '%', health.surfaces_pass + '/' + (health.surfaces_pass + health.surfaces_warn + health.surfaces_fail) + ' inspectable pass') +
          healthMetric('Status', pill(health.status), health.surfaces_warn + ' warn · ' + health.surfaces_limited + ' not inspectable') +
          healthMetric('Findings', escapeHtml(String((s.findings || []).length)), (s.fix_plan ? s.fix_plan.open_items : 0) + ' fixable') +
        '</div></div>') : '';
      const findingsPanel = (s.findings && s.findings.length) ? panel('Findings', 'Discovery gaps and capture limitations',
        '<div class="table-wrap"><table><thead><tr><th>Severity</th><th>Surface</th><th>Finding</th></tr></thead><tbody>' +
        s.findings.map((f) => '<tr><td>' + pill(sevStatus(f.severity), f.severity) + (f.nature === 'capture_limitation' ? ' <span class="muted" style="font-size:11px">capture limit</span>' : '') + '</td><td><strong>' + escapeHtml(f.surface) + '</strong></td><td class="muted" style="font-size:12px">' + escapeHtml(f.detail) + '</td></tr>').join('') +
        '</tbody></table></div>') : '';
      const fixPanel = (s.fix_plan && s.fix_plan.items && s.fix_plan.items.length) ? panel('Fix plan', s.fix_plan.open_items + ' recommended fix' + (s.fix_plan.open_items === 1 ? '' : 'es') + ' for the ecommerce team',
        '<div class="panel-body">' + s.fix_plan.items.map((item) => '<div style="margin-bottom:10px"><strong>' + escapeHtml(item.surface) + '</strong> ' + pill(sevStatus(item.severity), item.severity) + '<div class="muted" style="font-size:12px;margin-top:2px">' + escapeHtml(item.recommendation) + '</div></div>').join('') +
        (s.report_md_path ? '<p style="margin-top:8px"><a href="' + artifactHref(s.report_md_path) + '" target="_blank"><strong>Open executive report</strong></a></p>' : '') + '</div>') : '';
      el.innerHTML = healthPanel +
        panel('Catalog summary', 'Captured ' + escapeHtml((s.captured_at || '').slice(0, 16).replace('T', ' ')),
        '<div class="panel-body"><div class="metric-row">' + metrics + '</div>' +
        (s.discovery_signal ? '<p class="muted" style="margin-top:10px;font-size:12px">' + escapeHtml(s.discovery_signal) + '</p>' : '') +
        (s.search_signal && s.search_signal.note ? '<p class="muted" style="margin-top:4px;font-size:12px">Search: ' + escapeHtml(s.search_signal.note) + '</p>' : '') +
        (topCats ? '<div class="muted" style="margin-top:12px;font-size:12px">Top categories</div><div class="table-wrap"><table><thead><tr><th>Category</th><th>Products</th></tr></thead><tbody>' + topCats + '</tbody></table></div>' : '') +
        '</div>') +
        (surfaces ? panel('Discovery surfaces', 'The same discovery surfaces inspected for Shopify, for this WooCommerce store',
          '<div class="table-wrap"><table><thead><tr><th>Surface</th><th>Status</th><th>Signal</th></tr></thead><tbody>' + surfaces + '</tbody></table></div>') : '') +
        (facets ? panel('Facets & attributes', facets.attribute_count + ' attributes · ' + facets.filterable_count + ' filterable · ' + facets.products_with_attributes + '/' + facets.sample_size + ' sampled products carry attributes',
          facetRows ? '<div class="table-wrap"><table><thead><tr><th>Facet</th><th>Terms</th><th>Sample terms</th></tr></thead><tbody>' + facetRows + '</tbody></table></div>' : '<div class="panel-body"><div class="empty">No filterable attributes.</div></div>') : '') +
        findingsPanel + fixPanel;
    }
    function wireWooSearch(targetId) {
      let searchTimer = null;
      let autoTimer = null;
      const searchInput = document.getElementById('wooSearchInput');
      const autoInput = document.getElementById('wooAutoInput');
      if (searchInput) searchInput.addEventListener('input', (event) => {
        const query = event.target.value;
        clearTimeout(searchTimer);
        const out = document.getElementById('wooSearchResults');
        if (!query.trim()) { out.textContent = 'Type a query to see live results.'; return; }
        searchTimer = setTimeout(async () => {
          out.textContent = 'Searching…';
          try {
            const data = await api('/api/woo/search?target=' + encodeURIComponent(targetId) + '&q=' + encodeURIComponent(query));
            out.innerHTML = '<div><strong>' + data.result_count + '</strong> result' + (data.result_count === 1 ? '' : 's') + ' for “' + escapeHtml(query) + '”</div>' +
              (data.results && data.results.length
                ? '<ul style="margin:6px 0 0;padding-left:18px">' + data.results.slice(0, 8).map((r) => '<li><a href="' + escapeHtml(r.permalink || '#') + '" target="_blank" rel="noopener">' + escapeHtml(r.name) + '</a></li>').join('') + '</ul>'
                : '<div class="muted" style="margin-top:4px">No products matched — a possible search-relevance gap for this query.</div>');
          } catch (error) { out.textContent = 'Search failed: ' + error.message; }
        }, 350);
      });
      if (autoInput) autoInput.addEventListener('input', (event) => {
        const prefix = event.target.value;
        clearTimeout(autoTimer);
        const out = document.getElementById('wooAutoResults');
        if (!prefix.trim()) { out.textContent = 'Start typing to see suggestions.'; return; }
        autoTimer = setTimeout(async () => {
          try {
            const data = await api('/api/woo/autocomplete?target=' + encodeURIComponent(targetId) + '&q=' + encodeURIComponent(prefix));
            out.innerHTML = (data.suggestions && data.suggestions.length
              ? '<ul style="margin:0;padding-left:18px">' + data.suggestions.slice(0, 6).map((sug) => '<li>' + escapeHtml(sug.name) + '</li>').join('') + '</ul>'
              : '<div class="muted">No suggestions for “' + escapeHtml(prefix) + '”.</div>');
          } catch (error) { out.textContent = 'Autocomplete failed: ' + error.message; }
        }, 250);
      });
    }
    function healthMetric(label, value, detail) {
      return '<article class="metric"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' + value + '</div><div class="metric-detail">' + escapeHtml(detail || '') + '</div></article>';
    }
    function coverageSparkline(trend) {
      if (!trend || trend.length < 2) return '';
      const values = trend.map((point) => Number(point.coverage) || 0);
      const max = Math.max(100, ...values);
      const bars = values.map((value) => '<span class="spark-bar" style="height:' + Math.max(4, Math.round((value / max) * 28)) + 'px" title="' + escapeHtml(String(value)) + '%"></span>').join('');
      return '<div class="spark">' + bars + '</div>';
    }
    async function loadSiteHealth(targetId) {
      let h;
      try {
        h = await api('/api/site-health?target=' + encodeURIComponent(targetId));
      } catch (error) {
        const el = document.getElementById('siteHealth');
        if (el) el.innerHTML = '';
        return;
      }
      if (state.selectedSite !== targetId) return; // navigated away while loading
      const el = document.getElementById('siteHealth');
      if (!el) return;
      if (!h.inspected) {
        el.innerHTML = panel('Health summary', 'At a glance', '<div class="panel-body"><div class="empty">Not yet inspected — run an inspection to see this site\\'s health.</div></div>');
        return;
      }
      const latest = h.latest;
      const lastInspected = (latest.timestamp || '').slice(0, 16).replace('T', ' ');
      const fixOpen = h.fix_plan ? h.fix_plan.open_items : 0;
      const fixFixed = h.fix_plan ? h.fix_plan.verified_items : 0;
      const metrics =
        healthMetric('Readiness', pill(latest.readiness), 'Latest run') +
        healthMetric('Coverage', escapeHtml(String(latest.coverage)) + '%', h.coverage_trend.length > 1 ? 'across ' + h.coverage_trend.length + ' runs' : 'observed') +
        healthMetric('Status', pill(latest.status), latest.confidence ? escapeHtml(latest.confidence) + ' confidence' : '') +
        healthMetric('Warnings / Failures', escapeHtml(String(latest.warning_components || 0)) + ' / ' + escapeHtml(String(latest.failed_components || 0)), 'latest components') +
        healthMetric('Open fixes', escapeHtml(String(fixOpen)), fixFixed + ' verified fixed') +
        healthMetric('Last clean run', h.last_clean ? escapeHtml((h.last_clean.timestamp || '').slice(0, 10)) : '—', h.last_clean ? 'no failed components' : 'no fully clean run yet');
      el.innerHTML = panel('Health summary', h.run_count + ' run' + (h.run_count === 1 ? '' : 's') + ' · last inspected ' + escapeHtml(lastInspected),
        '<div class="panel-body"><div class="metric-row">' + metrics + '</div>' +
        (h.coverage_trend.length > 1 ? '<div class="muted" style="margin-top:10px;font-size:12px">Coverage trend</div>' + coverageSparkline(h.coverage_trend) : '') + '</div>');
    }
    function dataFileButtons(files, origin) {
      return '<div class="data-files">' + files.map((file) =>
        '<button class="data-file" data-path="' + escapeHtml(file.path) + '" data-origin="' + escapeHtml(origin) + '">' +
          '<span class="file-name">' + escapeHtml(file.name) + '</span>' +
          '<small>' + escapeHtml(file.format.toUpperCase() + ' · ' + formatBytes(file.size_bytes)) + '</small>' +
        '</button>').join('') + '</div>';
    }
    async function loadSiteData(targetId) {
      let data;
      try {
        data = await api('/api/site-data?target=' + encodeURIComponent(targetId));
      } catch (error) {
        const el = document.getElementById('siteData');
        if (el) el.innerHTML = '<div class="empty">Could not load site data: ' + escapeHtml(error.message) + '</div>';
        return;
      }
      if (state.selectedSite !== targetId) return; // navigated away while loading
      const origin = 'site:' + targetId;
      const promotable = new Set((data.groups.find((group) => group.id === 'query-packs')?.files || []).map((file) => file.path));
      const groupBlocks = data.groups.map((group) =>
        '<div class="data-group"><h3>' + escapeHtml(group.label) + '</h3>' + dataFileButtons(group.files, origin) +
          (group.id === 'query-packs' ? '<div class="muted" style="font-size:12px;margin-top:4px">Use “Promote to sector” on a query pack to share it with other sites.</div>' : '') +
        '</div>').join('');
      const runBlocks = data.runs.length
        ? '<div class="data-group"><h3>Run datasets (DS1–DS4)</h3>' + data.runs.map((run) =>
            '<div class="data-run"><div class="muted mono">' + escapeHtml((run.timestamp || '').slice(0, 16).replace('T', ' ')) + ' · ' + escapeHtml(run.inspection_id) + '</div>' +
            dataFileButtons(run.datasets, origin) + '</div>').join('') + '</div>'
        : '';
      const membership = data.sector_membership.length
        ? '<div class="data-group"><h3>Sector data this site uses</h3>' + data.sector_membership.map((sector) =>
            '<div class="sector-row"><strong>' + escapeHtml(sector.name) + '</strong> ' + dataFileButtons(sector.query_pack_files, 'shared') +
            ' <button class="link-btn sector-open" data-sector="' + escapeHtml(sector.sector_id) + '">Compare sites in this sector →</button></div>').join('') + '</div>'
        : '';
      const available = data.sectors_available.length
        ? '<div class="data-group"><h3>Sector data available to use</h3>' + data.sectors_available.map((sector) =>
            '<div class="sector-row"><strong>' + escapeHtml(sector.name) + '</strong> <span class="muted">' + (sector.member_sites.length ? sector.member_sites.length + ' site(s) use this' : 'not used yet') + '</span>' +
            ' <button class="link-btn adopt-sector" data-sector="' + escapeHtml(sector.sector_id) + '">Use for ' + escapeHtml(data.name) + '</button></div>').join('') + '</div>'
        : '';
      const promoteForm = promotable.size
        ? '<div class="data-group"><h3>Promote a query pack to sector data</h3>' +
            '<div class="promote-row"><select id="promotePack">' + Array.from(promotable).map((packPath) =>
              '<option value="' + escapeHtml(packPath) + '">' + escapeHtml(packPath.split('/').pop()) + '</option>').join('') + '</select>' +
            '<input id="promoteSector" placeholder="Sector name (e.g. Women\\'s Apparel)">' +
            '<button id="promoteBtn">Promote to sector</button></div>' +
            '<p class="muted" id="promoteResult" style="font-size:12px;margin-top:6px"></p></div>'
        : '';
      document.getElementById('siteData').innerHTML =
        panel('Data connected to this site', 'Every dataset tied to ' + escapeHtml(data.name) + ' — open any to inspect its records',
          '<div class="panel-body">' + groupBlocks + runBlocks + membership + available + promoteForm + '</div>');
      for (const btn of document.querySelectorAll('#siteData .data-file, #siteData .sector-row .data-file')) {
        btn.addEventListener('click', () => { window.location.hash = datasetHash(btn.dataset.path, btn.dataset.origin); });
      }
      for (const btn of document.querySelectorAll('#siteData .sector-open')) {
        btn.addEventListener('click', () => { window.location.hash = '#sector=' + encodeURIComponent(btn.dataset.sector); });
      }
      for (const btn of document.querySelectorAll('#siteData .adopt-sector')) {
        btn.addEventListener('click', async () => {
          try {
            await api('/api/sector/adopt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target_id: targetId, sector_id: btn.dataset.sector }) });
            loadSiteData(targetId);
          } catch (error) { document.getElementById('promoteResult') && (document.getElementById('promoteResult').textContent = error.message); }
        });
      }
      const promoteBtn = document.getElementById('promoteBtn');
      if (promoteBtn) promoteBtn.addEventListener('click', async () => {
        const result = document.getElementById('promoteResult');
        const sectorName = document.getElementById('promoteSector').value.trim();
        if (!sectorName) { result.textContent = 'Enter a sector name first.'; return; }
        try {
          const sector = await api('/api/sector/promote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target_id: targetId, dataset_path: document.getElementById('promotePack').value, sector_name: sectorName }) });
          result.textContent = 'Promoted to sector “' + sector.name + '”. It is now shared and other sites can use it.';
          loadSiteData(targetId);
        } catch (error) { result.textContent = error.message; }
      });
    }
    async function openRun(runId) {
      state.selected = runId;
      const run = state.inspections.find((entry) => entry.inspection_id === runId);
      if (run) { state.selectedSite = run.target_id; highlightSite(run.target_id); }
      await loadInspection(runId);
    }
    async function cleanupFlow() {
      const policy = document.getElementById('cleanupPolicy').value;
      const result = document.getElementById('cleanupResult');
      const preview = await api('/api/cleanup/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policy })
      });
      if (preview.runs_to_remove === 0) {
        result.textContent = 'Nothing to remove: ' + preview.runs_kept + ' run(s) already fit this policy.';
        return;
      }
      const refNote = preview.referenced_runs_removed
        ? ' ' + preview.referenced_runs_removed + ' of these are referenced by a fix plan (its inspection provenance pointer will go stale).'
        : '';
      const ok = window.confirm('Delete ' + preview.runs_to_remove + ' inspection run(s) and free ' + preview.freed_mb + ' MB? Keeps ' + preview.runs_kept + ' run(s).' + refNote + ' Cannot be undone. Manifests, query packs, and fix plans are not touched.');
      if (!ok) {
        result.textContent = 'Cancelled. ' + preview.runs_to_remove + ' run(s) / ' + preview.freed_mb + ' MB would have been freed.';
        return;
      }
      const applied = await api('/api/cleanup/apply', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policy })
      });
      result.textContent = 'Removed ' + applied.removed_count + ' run(s), freed ' + applied.freed_mb + ' MB. Kept ' + applied.kept_count + '.';
      state.selected = null;
      await refresh();
    }
    function rows(items, cells) {
      if (!items || !items.length) return '<div class="empty">No records.</div>';
      return '<div class="table-wrap"><table><tbody>' + items.map((item) => '<tr>' + cells(item).join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    function table(headers, items, cells) {
      if (!items || !items.length) return '<div class="empty">No records.</div>';
      return '<div class="table-wrap"><table><thead><tr>' + headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join('') + '</tr></thead><tbody>' + items.map((item) => '<tr>' + cells(item).join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    function panel(title, kicker, body) {
      return '<section class="panel"><div class="panel-head"><h2>' + escapeHtml(title) + '</h2><span>' + escapeHtml(kicker || '') + '</span></div>' + body + '</section>';
    }
    function metric(label, value, detail) {
      return '<article class="metric"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' + escapeHtml(value) + '</div><div class="metric-detail">' + escapeHtml(detail || '') + '</div></article>';
    }
    async function loadInspection(id) {
      const data = await api('/api/inspection/' + encodeURIComponent(id));
      renderDetail(data);
    }
    function httpClass(status) {
      if (typeof status !== 'number') return 'muted-status';
      if (status >= 200 && status < 300) return 'pass';
      if (status >= 300 && status < 400) return 'warn';
      return 'fail';
    }
    // Fix-plan statuses describe the STORE issue's lifecycle, not our
    // inspection. Present them in store language so nothing reads as "our
    // inspection failed".
    function fixStatusLabel(status) {
      return ({
        open: 'Present',
        still_failing: 'Still present',
        verified_fixed: 'Fixed (verified)',
        regressed: 'Regressed',
        not_checked: 'Not re-checked'
      })[status] || status;
    }
    function activateDetailTab(tab) {
      state.detailTab = tab;
      for (const button of document.querySelectorAll('.detail-tab')) button.classList.toggle('active', button.dataset.tab === tab);
      for (const panel of document.querySelectorAll('.detail-tabpanel')) panel.hidden = panel.dataset.tab !== tab;
    }
    // Every non-clean status becomes an attention item carrying the concrete
    // evidence behind it (query, HTTP status, endpoint) and a link to the raw
    // file. The only claim allowed without evidence is "everything worked".
    function buildAttention(report, data) {
      const items = [];
      const RETRYABLE_PLUGINS = ['rendered-product', 'rendered-search'];
      const TRANSIENT_CODES = ['bot_challenge', 'browser_timeout', 'server_error', 'rate_limited'];
      for (const plugin of report.plugin_results || []) {
        const hasLimits = (plugin.infrastructure_limitations || []).length > 0;
        // Surface any plugin that failed, warned, or carries limitations even
        // while nominally passing — a limitation is a reason that needs a home.
        if (!['blocked', 'fail', 'warn'].includes(plugin.status) && !hasLimits) continue;
        const limits = (plugin.infrastructure_limitations || []).map((limit) => {
          const text = (limit.query_id ? limit.query_id + ': ' : '') + (limit.label || limit.code || 'issue') +
            (typeof limit.status === 'number' ? ' (HTTP ' + limit.status + ')' : '') +
            (limit.endpoint ? ' — ' + limit.endpoint : '');
          // A transient wall (429 / bot challenge / timeout) on a rendered
          // plugin can be retried per-URL to clear the warning.
          const retryable = RETRYABLE_PLUGINS.includes(plugin.plugin_id) && limit.query_id &&
            (TRANSIENT_CODES.includes(limit.code) || limit.status === 429 || (typeof limit.status === 'number' && limit.status >= 500));
          return retryable ? { text, retry: { plugin_id: plugin.plugin_id, key: limit.query_id } } : { text };
        });
        const isFail = plugin.status === 'blocked' || plugin.status === 'fail';
        const headline = isFail
          ? '<strong>' + escapeHtml(plugin.plugin_id) + '</strong> was ' + escapeHtml(plugin.status)
          : '<strong>' + escapeHtml(plugin.plugin_id) + '</strong> ' + (limits.length ? 'has ' + limits.length + ' limitation' + (limits.length === 1 ? '' : 's') : 'completed with warnings');
        items.push({
          severity: isFail ? 'fail' : 'warn',
          tab: 'health',
          headline,
          detail: limits.length ? limits : [{ text: 'No per-request classification recorded; open the evidence to inspect ' + plugin.observations + ' observation(s).' }],
          evidence_file: plugin.evidence_file || null,
          run_dir: data.run_dir
        });
      }
      for (const endpoint of report.endpoint_discovery || []) {
        if (endpoint.ok) continue;
        items.push({
          severity: 'fail',
          tab: 'health',
          headline: '<strong>' + escapeHtml(endpoint.label) + '</strong> endpoint ' + escapeHtml(endpoint.classification?.label || 'unavailable'),
          detail: ['HTTP ' + (endpoint.status ?? 'n/a') + ' — ' + (endpoint.url || '')],
          evidence_file: null
        });
      }
      for (const item of (data.fix_plan?.items || []).filter((entry) => ['open', 'still_failing', 'regressed'].includes(entry.status))) {
        items.push({
          severity: item.severity === 'High' ? 'fail' : 'warn',
          tab: 'findings',
          headline: '<strong>Open fix</strong> [' + escapeHtml(item.severity) + '] ' + escapeHtml(item.surface) + ': ' + escapeHtml(item.query),
          detail: [item.recommendation],
          evidence_file: null
        });
      }
      return items;
    }
    function expandableChip(count, label, lines, evidenceHref) {
      if (!count) return '<span class="chip">0 ' + escapeHtml(label) + '</span>';
      const link = evidenceHref ? ' <a href="' + evidenceHref + '">view evidence</a>' : '';
      return '<details class="chip-details"><summary class="chip chip-active">' + count + ' ' + escapeHtml(label) + '</summary><div class="chip-body"><ul>' +
        lines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul>' + link + '</div></details>';
    }
    function attentionItem(item) {
      const link = item.evidence_file
        ? ' <a href="' + (isDatasetFile(item.evidence_file) ? datasetHash(item.evidence_file) : artifactHref(item.evidence_file)) + '"' + (isDatasetFile(item.evidence_file) ? '' : ' target="_blank"') + '>view evidence</a>'
        : '';
      const goto = item.tab ? ' <a href="#" data-goto-tab="' + item.tab + '" class="att-goto">go to ' + item.tab + '</a>' : '';
      return '<details class="att-item att-' + item.severity + '"><summary><span class="att-dot ' + item.severity + '"></span>' + item.headline + goto + link + '</summary><ul>' +
        item.detail.map((line) => {
          const text = typeof line === 'string' ? line : line.text;
          const retryBtn = (typeof line === 'object' && line.retry && item.run_dir)
            ? ' <button class="retry-capture-btn" data-run="' + escapeHtml(item.run_dir) + '" data-plugin="' + escapeHtml(line.retry.plugin_id) + '" data-key="' + escapeHtml(line.retry.key) + '">Retry this URL</button>'
            : '';
          return '<li>' + escapeHtml(text) + retryBtn + '</li>';
        }).join('') + '</ul></details>';
    }
    function renderTimeline(timeline, report) {
      if (!timeline.length) return panel('Inspection Timeline', 'What happened, step by step', '<div class="panel-body"><div class="empty">No timeline recorded for this run.</div></div>');

      // Lifecycle phases (everything that is not a per-plugin event) as a stepper.
      const phaseLabels = {
        inspection_started: 'Started',
        platform_validation_completed: 'Platform check',
        site_profile_cache_decision: 'Site profile',
        site_profile_written: 'Discovery',
        datasets_generated: 'Datasets',
        plugin_graph_built: 'Plan',
        inspection_completed: 'Completed',
        inspection_interrupted_for_validation: 'Interrupted'
      };
      // Collapse to one node per phase type (a resumed or re-run inspection can
      // record a phase more than once); the most severe state for that phase wins.
      const severity = { pass: 0, warn: 1, fail: 2 };
      const phaseOrder = Object.keys(phaseLabels);
      const phaseState = {};
      for (const event of timeline) {
        if (!phaseLabels[event.event]) continue;
        const status = String(event.status || '').toLowerCase();
        const state = event.event === 'inspection_interrupted_for_validation' ? 'warn'
          : status === 'warn' ? 'warn'
          : status === 'fail' || status === 'blocked' ? 'fail'
          : 'pass';
        if (!(event.event in phaseState) || severity[state] > severity[phaseState[event.event]]) phaseState[event.event] = state;
      }
      const phases = phaseOrder
        .filter((event) => event in phaseState)
        .map((event) => '<div class="tl-step"><span class="tl-node ' + phaseState[event] + '"></span><span class="tl-step-label">' + escapeHtml(phaseLabels[event]) + '</span></div>')
        .join('<span class="tl-connector"></span>');

      // Per-plugin lanes: each observation is a status-colored cell (a request
      // heatmap), with the plugin's final status pill and observation counts.
      const plugins = [];
      const order = [];
      for (const event of timeline) {
        if (!event.plugin_id) continue;
        if (!plugins[event.plugin_id]) { plugins[event.plugin_id] = { id: event.plugin_id, obs: [], status: null }; order.push(event.plugin_id); }
        if (event.event === 'plugin_observation_recorded') plugins[event.plugin_id].obs.push(event);
        if (event.event === 'plugin_completed') plugins[event.plugin_id].status = event.status;
      }
      const resultById = new Map((report?.plugin_results || []).map((result) => [result.plugin_id, result]));
      const lanes = order.map((id) => {
        const lane = plugins[id];
        const cells = lane.obs.map((observation) => {
          const label = (observation.query_id || '') + ' → HTTP ' + (observation.status ?? 'n/a');
          return '<span class="tl-cell ' + httpClass(observation.status) + '" title="' + escapeHtml(label) + '"></span>';
        }).join('');
        const errors = lane.obs.filter((observation) => typeof observation.status === 'number' && observation.status >= 400).length;
        const meta = lane.obs.length + ' request' + (lane.obs.length === 1 ? '' : 's') + (errors ? ' · ' + errors + ' error' + (errors === 1 ? '' : 's') : '');
        // Show the reason inline for any non-clean lane: the concrete
        // limitations plus a link to the evidence, so "why WARN?" is answerable
        // right here without leaving the lane.
        const result = resultById.get(id);
        const limits = result?.infrastructure_limitations || [];
        const laneStatus = result?.status || lane.status;
        let why = '';
        if (limits.length || (laneStatus && !['pass', 'not_run'].includes(laneStatus))) {
          const lines = limits.length
            ? limits.map((limit) => (limit.query_id ? limit.query_id + ': ' : '') + (limit.label || limit.code || 'issue') + (typeof limit.status === 'number' ? ' (HTTP ' + limit.status + ')' : '') + (limit.endpoint ? ' — ' + limit.endpoint : ''))
            : ['Completed as ' + laneStatus + '; open the evidence for per-observation detail.'];
          const link = result?.evidence_file
            ? ' <a href="' + (isDatasetFile(result.evidence_file) ? datasetHash(result.evidence_file) : artifactHref(result.evidence_file)) + '"' + (isDatasetFile(result.evidence_file) ? '' : ' target="_blank"') + '>view evidence</a>'
            : '';
          const summaryText = laneStatus === 'pass'
            ? lines.length + ' limitation' + (lines.length === 1 ? '' : 's') + ' (did not block this surface)'
            : 'Why ' + escapeHtml(laneStatus) + '? — ' + lines.length + ' issue' + (lines.length === 1 ? '' : 's');
          why = '<details class="att-item att-warn" style="margin-top:8px"><summary><span class="att-dot warn"></span>' + summaryText + link + '</summary><ul>' + lines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul></details>';
        }
        return '<div class="tl-lane"><div class="tl-lane-head"><strong>' + escapeHtml(id) + '</strong>' + pill(laneStatus || 'not_run') + '</div><div class="tl-cells">' + (cells || '<span class="muted">no HTTP requests recorded (rendered capture)</span>') + '</div><div class="muted" style="font-size:12px">' + escapeHtml(meta) + '</div>' + why + '</div>';
      }).join('');

      // Attention: reuse the evidence-backed attention model (plugins/endpoints)
      // so each item expands to its concrete records and links to the raw file.
      const attention = report ? buildAttention(report, {}).filter((item) => item.tab === 'health') : [];
      const attentionBlock = attention.length
        ? '<div class="tl-attention"><div class="tl-attention-title">Needs attention</div>' + attention.map(attentionItem).join('') + '</div>'
        : '<div class="tl-clear">No failures recorded — every request and plugin completed cleanly.</div>';

      return panel('Inspection Timeline', 'What happened, step by step',
        '<div class="panel-body">' +
          attentionBlock +
          '<div class="tl-stepper">' + phases + '</div>' +
          '<div class="tl-legend"><span><span class="tl-cell pass"></span> 2xx OK</span><span><span class="tl-cell warn"></span> 3xx redirect</span><span><span class="tl-cell fail"></span> 4xx/5xx error</span></div>' +
          '<div class="tl-lanes">' + (lanes || '<div class="empty">No plugin activity recorded.</div>') + '</div>' +
        '</div>');
    }
    function renderDetail(data) {
      const report = data.report || {};
      const dashboard = data.dashboard || report.dashboard || {};
      const summary = dashboard.crawl_summary || {};
      const op = dashboard.operational_summary || {};
      const coverage = dashboard.evidence_coverage || {};
      const limitations = report.limitations || {};
      const groups = data.artifact_index?.groups || dashboard.artifact_explorer || {};
      const platformGaps = limitations.platform_capability_gaps || [];
      const infra = limitations.infrastructure_limitations || [];

      // Evidence-backed attention model: every non-clean status expands to the
      // concrete records behind it. Nothing here is asserted without evidence.
      const attention = buildAttention(report, data);
      const healthAttention = attention.filter((item) => item.tab === 'health');
      const findingsAttention = attention.filter((item) => item.tab === 'findings');
      const healthFail = healthAttention.filter((item) => item.severity === 'fail').length;
      const healthWarn = healthAttention.filter((item) => item.severity === 'warn').length;

      const statusState = cls(summary.overall_inspection_status);
      const statusPill = '<button class="status ' + statusState + ' status-link" data-tab="health" title="See what is incomplete">' + escapeHtml(String(summary.overall_inspection_status || 'unknown').toUpperCase()) + '</button>';

      const siteName = summary.target_name || report.target?.name || 'Site';
      const runLabel = (report.generated_at || report.inspection_id || '').slice(0, 16).replace('T', ' ');
      const breadcrumb = '<div class="crumb-bar"><a href="#" class="crumb-link" id="crumbSite" data-target="' + escapeHtml(report.target?.target_id || '') + '">' + escapeHtml(siteName) + '</a><span class="crumb-sep">›</span><span class="crumb-current">Run ' + escapeHtml(runLabel) + '</span><span class="muted" style="margin-left:6px">— results below trace to this run</span></div>';
      const heroSection = breadcrumb + '<section class="hero"><div><p class="eyebrow">Inspection Run</p><h1>' + escapeHtml(siteName) + '</h1><div class="subline"><span>' + escapeHtml(report.inspection_id || '') + '</span><span>' + escapeHtml(summary.target_url || '') + '</span><span>' + escapeHtml(report.generated_at || '') + '</span></div><div class="hero-actions"><button id="detailRerunBtn">Rerun ' + escapeHtml(siteName) + '</button><button id="detailResumeBtn" class="secondary">Resume</button><button id="detailEditBtn" class="secondary" data-target="' + escapeHtml(report.target?.target_id || '') + '">Edit setup</button></div></div><div style="text-align:right">' + statusPill + '<div class="muted" style="margin-top:8px">Readiness: ' + escapeHtml(op.downstream_report_readiness || 'unknown') + '</div></div></section>';

      const attentionSummary = attention.length
        ? '<div class="tl-attention"><div class="tl-attention-title">Needs attention — ' + attention.length + ' item' + (attention.length === 1 ? '' : 's') + '</div>' + attention.map(attentionItem).join('') + '</div>'
        : '<div class="tl-clear">Everything worked — every request, plugin, and endpoint completed cleanly, with no open fixes.</div>';

      const overviewTab =
        attentionSummary +
        '<section class="metric-grid">' +
          metric('Status', summary.overall_inspection_status || 'unknown', 'Overall inspection') +
          metric('Readiness', op.downstream_report_readiness || 'unknown', op.readiness_notes || '') +
          metric('Evidence Quality', summary.evidence_quality || 'unknown', 'Coverage and completeness') +
          metric('Confidence', summary.overall_confidence || 'unknown', 'Trust in observations') +
          metric('Coverage', (coverage.component_coverage_percent ?? 0) + '%', 'Observed components') +
          metric('Duration', Math.round((summary.inspection_duration_ms || 0) / 1000) + ' sec', 'Run time') +
        '</section>' +
        panel('Report Readiness', 'What should be fixed?', '<div class="panel-body readiness"><div>' + pill(op.downstream_report_readiness) + '<p class="muted">' + escapeHtml(op.readiness_notes || '') + '</p></div><div class="readiness-stats">' +
          expandableChip(platformGaps.length, 'platform gaps', platformGaps.map((gap) => (gap.capability_id ? gap.capability_id + ' ' : '') + (gap.name || '') + (gap.notes ? ' — ' + gap.notes : '')), datasetHash('platform/capability-registry.json')) +
          expandableChip(infra.length, 'infrastructure limits', infra.map((limit) => (limit.query_id ? limit.query_id + ': ' : '') + (limit.label || limit.code || 'limitation') + (typeof limit.status === 'number' ? ' (HTTP ' + limit.status + ')' : '') + ((limit.endpoint || limit.url) ? ' — ' + (limit.endpoint || limit.url) : ''))) +
          '<span class="chip">' + (op.blocked_experiments || 0) + ' blocked experiments</span></div></div>' +
          table(['Category', 'Issue', 'Evidence'], [...platformGaps.map((gap) => ({ category: 'Platform', issue: (gap.capability_id || '') + ' ' + (gap.name || ''), evidence: gap.notes || '', dataset_link: gap.capability_id ? datasetHash('platform/capability-registry.json', gap.capability_id) : '' })), ...infra.map((limit) => ({ category: 'Infrastructure', issue: limit.label || limit.code || 'Limitation', evidence: (limit.status || '') + ' ' + (limit.url || limit.endpoint || limit.query_id || '') }))], (item) => ['<td>' + escapeHtml(item.category) + '</td>', '<td>' + (item.dataset_link ? '<a href="' + item.dataset_link + '">' + escapeHtml(item.issue) + '</a>' : escapeHtml(item.issue)) + '</td>', '<td>' + escapeHtml(item.evidence) + '</td>']));

      const findingsTab =
        panel('Executive Report', 'Generated from this inspection, no re-inspection', '<div class="panel-body readiness"><div>' +
          (data.executive_report
            ? '<p class="muted" style="margin:0 0 8px">An executive report exists for this inspection.</p><p style="margin:0">' + (data.executive_report.pdf_path ? '<a href="' + artifactHref(data.executive_report.pdf_path) + '" target="_blank"><strong>Open PDF</strong></a> · ' : '') + '<a href="' + artifactHref(data.executive_report.md_path) + '" target="_blank">Markdown</a> · <a href="' + datasetHash(data.executive_report.json_path) + '">Explore report data</a></p>'
            : '<p class="muted" style="margin:0">No executive report generated yet for this inspection.</p>') +
          '</div><div class="readiness-stats"><button id="curateBtn" class="secondary" data-run="' + escapeHtml(data.run_dir) + '">Curate Queries from Catalog</button><button id="execReportBtn" data-run="' + escapeHtml(data.run_dir) + '">' + (data.executive_report ? 'Regenerate' : 'Generate Executive Report') + '</button></div></div>') +
        panel('Fix Plan', 'Store issues to fix — status describes the store, not this inspection', '<div class="panel-body readiness"><div>' +
          (data.fix_plan
            ? '<p class="muted" style="margin:0">' + data.fix_plan.open_items + ' still present · ' + data.fix_plan.verified_items + ' fixed (verified)' + (data.fix_plan.last_verification_inspection ? ' · last re-checked against ' + escapeHtml(data.fix_plan.last_verification_inspection) : '') + ' · <a href="' + datasetHash(data.fix_plan.path) + '">Explore plan</a></p><p class="muted" style="margin:6px 0 0;font-size:12px">These are the store\\'s discovery issues to send to the ecommerce team. Our inspection succeeded; "still present" means the store issue is not yet resolved.</p>'
            : '<p class="muted" style="margin:0">No fix plan yet for this target. Generate one from an executive report with store findings.</p>') +
          '</div><div class="readiness-stats"><button id="fixPlanBtn" class="secondary" data-run="' + escapeHtml(data.run_dir) + '">' + (data.fix_plan ? 'Update Fix Plan' : 'Generate Fix Plan') + '</button>' + (data.fix_plan ? '<button id="verifyFixesBtn" class="secondary" data-run="' + escapeHtml(data.run_dir) + '">Verify Against This Run</button><button id="verifyLiveBtn" data-target="' + escapeHtml(data.fix_plan.target_id) + '">Run Verification Inspection</button>' : '') + '</div></div>' +
          (data.fix_plan && data.fix_plan.items.length
            ? table(['Store Issue', 'Severity', 'Surface', 'Query', 'Recommended Fix'], data.fix_plan.items, (item) => ['<td>' + pill(item.status, fixStatusLabel(item.status)) + '</td>', '<td>' + escapeHtml(item.severity) + '</td>', '<td>' + escapeHtml(item.surface) + '</td>', '<td><span class="mono">' + escapeHtml(item.query) + '</span></td>', '<td>' + escapeHtml(item.recommendation) + '</td>'])
            : ''));

      const healthTab =
        panel('Crawl Health', 'Status by component — non-passing rows link to evidence', table(['Surface', 'Status', 'Confidence', 'Notes'], report.crawl_health || [], (item) => ['<td><strong>' + escapeHtml(item.component) + '</strong></td>', '<td>' + pill(item.status) + '</td>', '<td>' + escapeHtml(item.confidence) + '</td>', '<td>' + escapeHtml(item.notes) + '</td>'])) +
        panel('Endpoint Debugging', 'Adapter output', table(['Endpoint', 'Status', 'Result', 'URL'], report.endpoint_discovery || [], (item) => ['<td><strong>' + escapeHtml(item.label) + '</strong></td>', '<td>' + pill(item.ok ? 'pass' : 'fail') + '</td>', '<td>' + escapeHtml(item.classification?.label || (item.ok ? 'Accessible' : 'Unavailable')) + '</td>', '<td><span class="mono">' + escapeHtml(item.url) + '</span></td>'])) +
        renderTimeline(data.timeline || [], report);

      const dataTab =
        '<div class="two-col">' +
          panel('Plugin State', 'Execution', table(['Plugin', 'Status', 'Observations', 'Evidence'], report.plugin_results || [], (item) => ['<td><strong>' + escapeHtml(item.plugin_id) + '</strong></td>', '<td>' + pill(item.status) + '</td>', '<td>' + escapeHtml(item.observations || 0) + '</td>', '<td>' + evidenceLinks(item.evidence_file) + '</td>'])) +
          panel('Datasets', 'DS1-DS4', table(['Dataset', 'Rows', 'Status', 'Records'], Object.entries(report.datasets || {}).map(([id, dataset]) => ({ id, ...dataset })), (item) => ['<td><strong>' + escapeHtml(item.id) + '</strong></td>', '<td>' + escapeHtml(item.rows) + '</td>', '<td>' + pill(item.status) + '</td>', '<td>' + evidenceLinks(item.path) + '</td>'])) +
        '</div>';

      const artifactsTab = panel('Artifact Explorer', 'Open evidence', '<div class="panel-body"><div class="artifacts">' + Object.entries(groups).map(([group, files]) => '<div class="artifact-group"><h3>' + escapeHtml(group.replaceAll('_', ' ')) + '</h3>' + ((files || []).length ? '<ul>' + files.map((file) => '<li><a href="' + artifactHref(file) + '" target="_blank">' + escapeHtml(file.split('/').pop()) + '</a><small>' + escapeHtml(file) + '</small></li>').join('') + '</ul>' : '<div class="empty">No artifacts.</div>') + '</div>').join('') + '</div></div>');

      function badge(count, kind) {
        return count > 0 ? '<span class="tab-badge ' + kind + '">' + count + '</span>' : '';
      }
      const tabBar = '<div class="detail-tabs">' +
        '<button class="detail-tab" data-tab="overview">Overview' + badge(attention.length, attention.some((item) => item.severity === 'fail') ? 'fail' : 'warn') + '</button>' +
        '<button class="detail-tab" data-tab="findings">Findings' + badge((data.fix_plan?.open_items) || 0, 'warn') + '</button>' +
        '<button class="detail-tab" data-tab="health">Health' + (healthFail ? badge(healthFail, 'fail') : badge(healthWarn, 'warn')) + '</button>' +
        '<button class="detail-tab" data-tab="data">Data</button>' +
        '<button class="detail-tab" data-tab="artifacts">Artifacts</button>' +
        '</div>';

      document.getElementById('detail').innerHTML =
        heroSection + tabBar +
        '<div class="detail-tabpanel" data-tab="overview">' + overviewTab + '</div>' +
        '<div class="detail-tabpanel" data-tab="findings">' + findingsTab + '</div>' +
        '<div class="detail-tabpanel" data-tab="health">' + healthTab + '</div>' +
        '<div class="detail-tabpanel" data-tab="data">' + dataTab + '</div>' +
        '<div class="detail-tabpanel" data-tab="artifacts">' + artifactsTab + '</div>';

      activateDetailTab(state.detailTab || 'overview');
      for (const tabButton of document.querySelectorAll('.detail-tab')) {
        tabButton.addEventListener('click', () => activateDetailTab(tabButton.dataset.tab));
      }
      for (const link of document.querySelectorAll('.status-link, [data-goto-tab]')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          activateDetailTab(link.dataset.tab || link.dataset.gotoTab);
        });
      }
      const detailRerunBtn = document.getElementById('detailRerunBtn');
      if (detailRerunBtn) detailRerunBtn.addEventListener('click', () => runAction('rerun').catch((error) => alert(error.message)));
      const detailResumeBtn = document.getElementById('detailResumeBtn');
      if (detailResumeBtn) detailResumeBtn.addEventListener('click', () => runAction('resume').catch((error) => alert(error.message)));
      const detailEditBtn = document.getElementById('detailEditBtn');
      if (detailEditBtn) detailEditBtn.addEventListener('click', () => { if (detailEditBtn.dataset.target) window.location.hash = '#setup=' + encodeURIComponent(detailEditBtn.dataset.target); });
      const crumbSite = document.getElementById('crumbSite');
      if (crumbSite) crumbSite.addEventListener('click', (event) => { event.preventDefault(); state.selected = null; selectSite(crumbSite.dataset.target); });
      for (const retryBtn of document.querySelectorAll('.retry-capture-btn')) {
        retryBtn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          retryBtn.disabled = true;
          retryBtn.textContent = 'Retrying…';
          try {
            const result = await api('/api/retry-capture', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ run_dir: retryBtn.dataset.run, plugin_id: retryBtn.dataset.plugin, key: retryBtn.dataset.key })
            });
            document.getElementById('actionResult').textContent = result.warning_cleared
              ? 'Retry succeeded for ' + result.key + ' — warning cleared and the report was updated' + (result.executive_report_regenerated ? ' (executive report regenerated).' : '.')
              : 'Retry for ' + result.key + ' still returned ' + result.status + '. Left as a limitation.';
            await loadInspection(state.selected);
          } catch (error) {
            alert(error.message);
            retryBtn.disabled = false;
            retryBtn.textContent = 'Retry this URL';
          }
        });
      }
      const fixPlanBtn = document.getElementById('fixPlanBtn');
      if (fixPlanBtn) {
        fixPlanBtn.addEventListener('click', async () => {
          fixPlanBtn.disabled = true;
          try {
            const result = await api('/api/fix-plan', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ run_dir: fixPlanBtn.dataset.run })
            });
            document.getElementById('actionResult').textContent = 'Fix plan updated: ' + result.items + ' item(s), ' + result.open_items + ' open, ' + result.verified_items + ' verified fixed.';
            await loadInspection(state.selected);
          } catch (error) {
            alert(error.message);
            fixPlanBtn.disabled = false;
          }
        });
      }
      const verifyFixesBtn = document.getElementById('verifyFixesBtn');
      if (verifyFixesBtn) {
        verifyFixesBtn.addEventListener('click', async () => {
          verifyFixesBtn.disabled = true;
          try {
            const result = await api('/api/verify-fixes', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ run_dir: verifyFixesBtn.dataset.run })
            });
            document.getElementById('actionResult').textContent = 'Verification against this run: ' + result.verified_this_run + ' newly verified fixed, ' + result.still_failing + ' still failing, ' + result.not_checked + ' not checked in this run.';
            await loadInspection(state.selected);
          } catch (error) {
            alert(error.message);
            verifyFixesBtn.disabled = false;
          }
        });
      }
      const verifyLiveBtn = document.getElementById('verifyLiveBtn');
      if (verifyLiveBtn) {
        verifyLiveBtn.addEventListener('click', async () => {
          verifyLiveBtn.disabled = true;
          try {
            const result = await api('/api/verify-fixes-live', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ target_id: verifyLiveBtn.dataset.target })
            });
            document.getElementById('actionResult').innerHTML = 'Verification inspection started (process ' + result.pid + '). Only the surfaces with open fix items are re-inspected; the plan updates automatically when it completes. Log: <a href="' + artifactHref(result.log_path) + '" target="_blank">' + escapeHtml(result.log_path) + '</a>';
            for (const delay of [15000, 45000, 90000, 180000]) setTimeout(refresh, delay);
          } catch (error) {
            alert(error.message);
            verifyLiveBtn.disabled = false;
          }
        });
      }
      const curateBtn = document.getElementById('curateBtn');
      if (curateBtn) {
        curateBtn.addEventListener('click', async () => {
          curateBtn.disabled = true;
          curateBtn.textContent = 'Curating...';
          try {
            const result = await api('/api/curate-queries', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ run_dir: curateBtn.dataset.run })
            });
            document.getElementById('actionResult').innerHTML = 'Curated ' + result.queries + ' store-specific queries from inspection ' + escapeHtml(result.curated_from_inspection) + ' into <a href="' + datasetHash(result.query_pack) + '">' + escapeHtml(result.query_pack) + '</a>' + (result.evaluation ? '; the evaluation manifest now uses it. Click Rerun to inspect with the curated queries.' : '.');
            curateBtn.textContent = 'Curate Queries from Catalog';
            curateBtn.disabled = false;
          } catch (error) {
            alert(error.message);
            curateBtn.disabled = false;
            curateBtn.textContent = 'Curate Queries from Catalog';
          }
        });
      }
      const execBtn = document.getElementById('execReportBtn');
      if (execBtn) {
        execBtn.addEventListener('click', async () => {
          execBtn.disabled = true;
          execBtn.textContent = 'Generating...';
          try {
            const result = await api('/api/executive-report', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ run_dir: execBtn.dataset.run })
            });
            document.getElementById('actionResult').innerHTML = 'Executive report generated from inspection ' + escapeHtml(result.inspection_id) + ': <a href="' + artifactHref(result.md_path) + '" target="_blank">' + escapeHtml(result.md_path) + '</a>';
            await loadInspection(state.selected);
          } catch (error) {
            alert(error.message);
            execBtn.disabled = false;
            execBtn.textContent = 'Generate Executive Report';
          }
        });
      }
    }
    function setView(view) {
      state.view = view;
      const dataView = view === 'shared' || view === 'dataset' || view === 'sector';
      document.getElementById('tabInspections').classList.toggle('active', view === 'inspections' || view === 'setup');
      document.getElementById('tabShared').classList.toggle('active', view === 'shared' || view === 'sector');
      document.getElementById('tabSettings').classList.toggle('active', view === 'settings');
      document.getElementById('runList').hidden = view !== 'inspections';
      document.getElementById('sitesList').hidden = view !== 'inspections';
      document.getElementById('datasetNav').hidden = true;
      document.getElementById('inspectionView').hidden = view !== 'inspections';
      document.getElementById('datasetView').hidden = !dataView;
      document.getElementById('setupView').hidden = view !== 'setup';
      document.getElementById('settingsView').hidden = view !== 'settings';
    }
    async function renderSettings() {
      setView('settings');
      const view = document.getElementById('settingsView');
      let total = '?';
      try { total = (await api('/api/storage')).total_runs; } catch (error) { /* ignore */ }
      view.innerHTML =
        '<section class="hero"><div><p class="eyebrow">Settings</p><h1>Data Management</h1><div class="subline"><span>' + total + ' inspection run' + (total === 1 ? '' : 's') + ' stored on disk</span></div></div></section>' +
        panel('Storage Cleanup', 'Reclaim disk space', '<div class="panel-body">' +
          '<div class="field" style="max-width:420px"><label for="cleanupPolicy">Cleanup policy</label><select id="cleanupPolicy">' +
            '<option value="captures-only">Delete only screenshots &amp; raw captures (keep evidence &amp; reports)</option>' +
            '<option value="keep-latest-1">Keep latest run per site (delete older runs)</option>' +
            '<option value="keep-latest-3">Keep latest 3 runs per site</option>' +
            '<option value="all-runs">Delete all inspection runs</option>' +
          '</select></div>' +
          '<div class="setup-actions"><button id="cleanupPreviewBtn">Preview cleanup</button></div>' +
          '<p class="muted" id="cleanupResult" style="margin-top:10px"></p>' +
          '<p class="muted" style="margin-top:8px;font-size:12px">Cleanup only ever removes run artifacts (timestamped run directories or their captures). Target manifests, query packs, fix plans, and runs referenced by a fix plan are never touched.</p>' +
        '</div>');
      document.getElementById('cleanupPreviewBtn').addEventListener('click', () => cleanupFlow().catch((error) => alert(error.message)));
    }
    function renderQueue(data) {
      const strip = document.getElementById('queueStrip');
      if (!strip) return;
      const active = (data.running ? 1 : 0) + data.pending.length;
      if (active === 0) { strip.hidden = true; strip.innerHTML = ''; return; }
      strip.hidden = false;
      const row = (item, running) => '<div class="queue-row">' + (running ? '<span class="spin"></span>' : '<span class="muted">#' + '</span>') +
        '<span class="q-label">' + escapeHtml(item.label) + (running ? ' — running' : ' — queued') + '</span>' +
        '<button class="queue-cancel secondary" data-id="' + escapeHtml(item.id) + '">Cancel</button></div>';
      strip.innerHTML =
        '<div class="queue-head"><strong>Run queue</strong><span class="muted">' + (data.running ? '1 running' : 'idle') + ' · ' + data.pending.length + ' queued</span>' +
        (data.pending.length ? '<button id="queueClearBtn" class="secondary" style="margin-left:auto;padding:3px 9px;font-size:11px">Clear queued</button>' : '') + '</div>' +
        (data.running ? row(data.running, true) : '') +
        data.pending.map((item) => row(item, false)).join('');
      for (const btn of strip.querySelectorAll('.queue-cancel')) {
        btn.addEventListener('click', async () => {
          try { await api('/api/queue/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: btn.dataset.id }) }); await pollQueue(); } catch (error) { alert(error.message); }
        });
      }
      const clearBtn = document.getElementById('queueClearBtn');
      if (clearBtn) clearBtn.addEventListener('click', async () => {
        try { await api('/api/queue/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); await pollQueue(); } catch (error) { alert(error.message); }
      });
    }
    async function pollQueue() {
      try {
        const data = await api('/api/queue');
        renderQueue(data);
        // When the running set changes, refresh the inspection list so new runs appear.
        const signature = (data.running ? data.running.id + data.running.status : '') + data.pending.length;
        if (state.lastQueueSignature !== undefined && state.lastQueueSignature !== signature && state.view === 'inspections') {
          refresh().catch(() => {});
        }
        state.lastQueueSignature = signature;
      } catch (error) { /* ignore poll errors */ }
    }
    async function renderSetup(targetId) {
      setView('setup');
      const container = document.getElementById('setupView');
      container.innerHTML = '<div class="empty">Loading setup…</div>';
      let config;
      try {
        config = await api('/api/inspection-config' + (targetId ? '?target_id=' + encodeURIComponent(targetId) : ''));
      } catch (error) {
        container.innerHTML = '<div class="panel"><div class="panel-body">Could not load setup: ' + escapeHtml(error.message) + '</div></div>';
        return;
      }
      const editing = config.mode === 'edit';
      container.innerHTML =
        '<section class="hero"><div><p class="eyebrow">' + (editing ? 'Edit Inspection Setup' : 'New Inspection') + '</p><h1>' + escapeHtml(editing ? config.name : 'Add a Shopify Store') + '</h1>' +
          '<div class="subline"><span>' + (editing ? escapeHtml(config.url) : 'Enter a store URL and choose what to inspect.') + '</span></div></div></section>' +
        '<div class="setup-form">' +
          '<div class="field"><label for="setupUrl">Store URL</label><input id="setupUrl" value="' + escapeHtml(config.url) + '" placeholder="https://yourstore.com"' + (editing ? ' readonly' : '') + '></div>' +
          '<div class="field"><label for="setupName">Display Name</label><input id="setupName" value="' + escapeHtml(config.name) + '" placeholder="Your Store"></div>' +
          '<div class="field"><label>Surfaces to Inspect</label><div class="checkbox-grid">' +
            config.plugins.map((plugin) => '<div class="checkbox-row"><input type="checkbox" id="pl-' + plugin.id + '"' + (plugin.selected ? ' checked' : '') + '><label for="pl-' + plugin.id + '">' + escapeHtml(plugin.label) + '</label></div>').join('') +
          '</div></div>' +
          '<div class="field"><label>Rendered Capture</label><div class="checkbox-grid">' +
            '<div class="checkbox-row"><input type="checkbox" id="render-desktop"' + (config.rendering.desktop ? ' checked' : '') + '><label for="render-desktop">Desktop browser + screenshots</label></div>' +
            '<div class="checkbox-row"><input type="checkbox" id="render-mobile"' + (config.rendering.mobile ? ' checked' : '') + '><label for="render-mobile">Mobile browser + screenshots</label></div>' +
          '</div><p class="muted" style="margin-top:6px">Rendered capture needs the Rendered Storefront surface and observes what customers actually see.</p></div>' +
          '<div class="setup-actions"><button id="setupSubmit">' + (editing ? 'Save & Re-inspect' : 'Create & Inspect') + '</button><button id="setupCancel" class="secondary">Cancel</button></div>' +
        '</div>';
      document.getElementById('setupCancel').addEventListener('click', () => { window.location.hash = '#inspections'; });
      document.getElementById('setupSubmit').addEventListener('click', async () => {
        const submit = document.getElementById('setupSubmit');
        submit.disabled = true;
        submit.textContent = 'Starting…';
        try {
          const plugins = config.plugins.filter((plugin) => document.getElementById('pl-' + plugin.id).checked).map((plugin) => plugin.id);
          const body = {
            target_id: editing ? config.target_id : undefined,
            url: document.getElementById('setupUrl').value.trim(),
            name: document.getElementById('setupName').value.trim(),
            plugins,
            rendering: { desktop: document.getElementById('render-desktop').checked, mobile: document.getElementById('render-mobile').checked },
            run: true
          };
          const result = await api('/api/inspection-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          window.location.hash = '#inspections';
          document.getElementById('actionResult').innerHTML = 'Inspection started for ' + escapeHtml(result.target_id) + ' (process ' + result.pid + '). It appears in the list when it completes. Log: <a href="' + artifactHref(result.log_path) + '" target="_blank">' + escapeHtml(result.log_path) + '</a>';
          for (const delay of [8000, 30000, 90000, 180000]) setTimeout(refresh, delay);
        } catch (error) {
          alert(error.message);
          submit.disabled = false;
          submit.textContent = editing ? 'Save & Re-inspect' : 'Create & Inspect';
        }
      });
    }
    async function renderShared() {
      setView('shared');
      const view = document.getElementById('datasetView');
      view.innerHTML = '<div class="empty">Loading shared data…</div>';
      let shared;
      try {
        shared = await api('/api/shared');
      } catch (error) {
        view.innerHTML = panel('Shared data', 'Error', '<div class="panel-body">Could not load shared data: ' + escapeHtml(error.message) + '</div>');
        return;
      }
      const platformBlock = '<div class="data-group"><h3>Platform capability model</h3>' +
        '<div class="muted" style="font-size:12px;margin-bottom:6px">The inspection platform\\'s own capability data — not tied to any site.</div>' +
        dataFileButtons(shared.platform, 'shared') + '</div>';
      const sectorBlocks = shared.sectors.length
        ? shared.sectors.map((sector) =>
            '<div class="data-group"><h3>' + escapeHtml(sector.name) + ' <span class="muted" style="font-weight:400">sector</span>' +
              ' <button class="link-btn sector-open" data-sector="' + escapeHtml(sector.sector_id) + '">View comparison →</button></h3>' +
            '<div class="muted" style="font-size:12px;margin-bottom:6px">' + escapeHtml(sector.description || '') +
              ' · ' + (sector.member_sites.length ? 'used by ' + sector.member_sites.map(escapeHtml).join(', ') : 'not used by any site yet') + '</div>' +
            dataFileButtons(sector.query_pack_files, 'shared') + '</div>').join('')
        : '<div class="empty">No sector data yet. Promote a site\\'s query pack to create one.</div>';
      view.innerHTML =
        '<div class="crumb-bar"><span class="crumb-current">Shared data</span><span class="muted">— platform + sector datasets, not tied to a single site</span></div>' +
        '<section class="hero"><div><p class="eyebrow">Shared</p><h1>Shared data</h1>' +
          '<div class="subline"><span>' + shared.platform.length + ' platform file(s)</span><span>' + shared.sectors.length + ' sector(s)</span></div></div></section>' +
        panel('Not tied to any site', 'Platform capability model and sector datasets that sites can reuse', '<div class="panel-body">' + platformBlock + sectorBlocks + '</div>');
      for (const btn of view.querySelectorAll('.data-file')) {
        btn.addEventListener('click', () => { window.location.hash = datasetHash(btn.dataset.path, btn.dataset.origin); });
      }
      for (const btn of view.querySelectorAll('.sector-open')) {
        btn.addEventListener('click', () => { window.location.hash = '#sector=' + encodeURIComponent(btn.dataset.sector); });
      }
    }
    async function renderSectorView(sectorId) {
      setView('sector');
      const view = document.getElementById('datasetView');
      view.innerHTML = '<div class="empty">Loading sector…</div>';
      let sector;
      try {
        sector = await api('/api/sector?id=' + encodeURIComponent(sectorId));
      } catch (error) {
        view.innerHTML = '<div class="crumb-bar"><a href="#shared" class="crumb-link">Shared</a></div>' +
          panel('Sector', 'Error', '<div class="panel-body">Could not load sector: ' + escapeHtml(error.message) + '</div>');
        return;
      }
      const compareRows = sector.members.length
        ? sector.members.map((member) => {
            const run = member.latest_run;
            const cells = run
              ? pill(run.status) + '</td>' +
                '<td>' + pill(run.readiness) + '</td>' +
                '<td>' + escapeHtml(String(run.coverage ?? '')) + '%</td>' +
                '<td>' + escapeHtml(String(run.warning_components ?? 0)) + '</td>' +
                '<td>' + escapeHtml(String(run.failed_components ?? 0)) + '</td>' +
                '<td class="muted mono">' + escapeHtml((run.timestamp || '').slice(0, 16).replace('T', ' '))
              : '<span class="muted">not yet inspected</span></td><td></td><td></td><td></td><td></td><td';
            return '<tr><td><button class="link-btn sector-site" data-target="' + escapeHtml(member.target_id) + '">' + escapeHtml(member.name) + '</button>' +
              '<div class="muted" style="font-size:11px">' + escapeHtml(member.url || '') + '</div></td>' +
              '<td>' + cells + '</td></tr>';
          }).join('')
        : '<tr><td colspan="7" class="muted">No member sites yet. Add sites from a site\\'s “Use for …” action.</td></tr>';
      view.innerHTML =
        '<div class="crumb-bar"><a href="#shared" class="crumb-link">Shared</a><span class="crumb-sep">›</span>' +
          '<span class="crumb-current">' + escapeHtml(sector.name) + '</span></div>' +
        '<section class="hero"><div><p class="eyebrow">Sector</p><h1>' + escapeHtml(sector.name) + '</h1>' +
          '<div class="subline"><span>' + sector.member_count + ' member site(s)</span><span>' + sector.query_pack_files.length + ' shared query pack(s)</span></div>' +
          (sector.description ? '<p class="muted" style="margin:8px 0 0">' + escapeHtml(sector.description) + '</p>' : '') + '</div></section>' +
        panel('Shared query packs', 'Reused by every member site', '<div class="panel-body">' + dataFileButtons(sector.query_pack_files, 'shared') + '</div>') +
        panel('Cross-site comparison', 'Latest inspection of each member site',
          '<div class="table-wrap"><table><thead><tr><th>Site</th><th>Status</th><th>Readiness</th><th>Coverage</th><th>Warnings</th><th>Failures</th><th>Latest run</th></tr></thead><tbody>' +
          compareRows + '</tbody></table></div>');
      for (const btn of view.querySelectorAll('.data-file')) {
        btn.addEventListener('click', () => { window.location.hash = datasetHash(btn.dataset.path, btn.dataset.origin); });
      }
      for (const btn of view.querySelectorAll('.sector-site')) {
        btn.addEventListener('click', () => {
          state.selected = null;
          state.selectedSite = btn.dataset.target;
          window.location.hash = '#inspections';
        });
      }
    }
    async function openDataset(file, from) {
      setView('dataset');
      const samePath = state.datasetPath === file && state.dataset;
      state.dataFrom = from || 'shared';
      state.selectedRecordIndex = -1;
      if (!samePath) {
        state.datasetPath = file;
        state.datasetField = '';
        state.datasetQuery = '';
        state.dataset = null;
        state.datasetError = null;
        window.scrollTo(0, 0);
        renderDatasetView();
        try {
          state.dataset = await api('/api/dataset?path=' + encodeURIComponent(file));
        } catch (error) {
          state.datasetError = error.message;
        }
      }
      renderDatasetView();
    }
    function recordText(record, field) {
      const value = field ? record[field] : record;
      if (value === null || value === undefined) return '';
      return typeof value === 'string' ? value : JSON.stringify(value);
    }
    function filteredRecords() {
      const query = state.datasetQuery.trim().toLowerCase();
      const rows = state.dataset.records.map((record, index) => ({ record, index }));
      if (!query) return rows;
      return rows.filter(({ record }) => recordText(record, state.datasetField).toLowerCase().includes(query));
    }
    function displayFields() {
      const fields = state.dataset.fields;
      const priority = fields.filter((field) => /(^|_)(id|name|query|title|status|type)$/i.test(field));
      const rest = fields.filter((field) => !priority.includes(field));
      return [...priority, ...rest].slice(0, 8);
    }
    function cellValue(value) {
      if (value === null || value === undefined) return '';
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return text.length > 140 ? text.slice(0, 140) + '…' : text;
    }
    function renderDatasetView() {
      const view = document.getElementById('datasetView');
      if (!state.datasetPath) {
        view.innerHTML = panel('Dataset Viewer', 'Browse repo datasets', '<div class="panel-body">Select a dataset on the left to inspect its records with search and field filtering. Evaluations, targets, query packs, site profiles, platform registries, inspection history, and generated DS1-DS4 run datasets are all available here.</div>');
        return;
      }
      if (state.datasetError) {
        view.innerHTML = panel('Dataset Viewer', 'Error', '<div class="panel-body">Could not load ' + escapeHtml(state.datasetPath) + ': ' + escapeHtml(state.datasetError) + '</div>');
        return;
      }
      if (!state.dataset) {
        view.innerHTML = '<div class="empty">Loading dataset...</div>';
        return;
      }
      const data = state.dataset;
      const manifest = data.meta && data.meta.manifest ? Object.entries(data.meta.manifest) : [];
      // Breadcrumb traces the dataset back to where it was opened from: a site
      // (Sites > Site > Data) or the Shared view — keeping the connection visible.
      const from = state.dataFrom || 'shared';
      let backBar;
      if (from.startsWith('site:')) {
        const target = from.slice('site:'.length);
        const site = (state.sites || []).find((entry) => entry.target_id === target);
        const label = site ? site.name : target;
        backBar = '<div class="crumb-bar">' +
          '<a href="#inspections" class="crumb-link">Sites</a><span class="crumb-sep">›</span>' +
          '<button class="crumb-back" data-target="' + escapeHtml(target) + '">' + escapeHtml(label) + '</button>' +
          '<span class="crumb-sep">›</span><span class="crumb-current">Data › ' + escapeHtml(data.path.split('/').pop()) + '</span></div>';
      } else {
        backBar = '<div class="crumb-bar">' +
          '<a href="#shared" class="crumb-link">Shared</a><span class="crumb-sep">›</span>' +
          '<span class="crumb-current">' + escapeHtml(data.path.split('/').pop()) + '</span></div>';
      }
      view.innerHTML = backBar +
        '<section class="hero"><div><p class="eyebrow">Dataset</p><h1>' + escapeHtml(data.path.split('/').pop()) + '</h1>' +
          '<div class="subline"><span class="mono">' + escapeHtml(data.path) + '</span><span>Modified ' + escapeHtml(data.modified_at) + '</span><span><a href="' + artifactHref(data.path) + '" target="_blank">Open raw file</a></span></div></div>' +
          '<div>' + pill(data.format) + '<div class="muted" style="margin-top:8px">' + data.record_count + ' records · ' + escapeHtml(formatBytes(data.size_bytes)) + '</div></div></section>' +
        (manifest.length ? panel('Manifest', data.meta.record_field ? 'Records read from "' + escapeHtml(data.meta.record_field) + '"' : '', table(['Field', 'Value'], manifest, (entry) => ['<td><strong>' + escapeHtml(entry[0]) + '</strong></td>', '<td><span class="mono">' + escapeHtml(cellValue(entry[1])) + '</span></td>'])) : '') +
        '<section class="panel"><div class="panel-head"><h2>Records</h2><span id="datasetCount"></span></div>' +
          '<div class="dataset-controls">' +
            '<div class="field"><label for="datasetSearch">Search</label><input id="datasetSearch" placeholder="Filter records" value="' + escapeHtml(state.datasetQuery) + '"></div>' +
            '<div class="field"><label for="datasetField">Field</label><select id="datasetField"><option value="">All fields</option>' + data.fields.map((field) => '<option value="' + escapeHtml(field) + '"' + (field === state.datasetField ? ' selected' : '') + '>' + escapeHtml(field) + '</option>').join('') + '</select></div>' +
          '</div>' +
          '<div id="datasetRecords"></div>' +
          '<div class="record-detail" id="recordDetail"></div>' +
        '</section>';
      const crumbBack = document.querySelector('.crumb-back');
      if (crumbBack) crumbBack.addEventListener('click', (event) => {
        event.preventDefault();
        state.selected = null;
        state.selectedSite = crumbBack.dataset.target;
        state.datasetPath = null;
        window.location.hash = '#inspections';
      });
      document.getElementById('datasetSearch').addEventListener('input', (event) => {
        state.datasetQuery = event.target.value;
        state.selectedRecordIndex = -1;
        renderDatasetRecords();
      });
      document.getElementById('datasetField').addEventListener('change', (event) => {
        state.datasetField = event.target.value;
        state.selectedRecordIndex = -1;
        renderDatasetRecords();
      });
      renderDatasetRecords();
    }
    function renderDatasetRecords() {
      const rows = filteredRecords();
      const counter = document.getElementById('datasetCount');
      counter.textContent = rows.length + ' of ' + state.dataset.record_count + ' records' + (state.dataset.truncated ? ' (first ' + state.dataset.returned_count + ' loaded)' : '');
      const fields = displayFields();
      document.getElementById('datasetRecords').innerHTML = rows.length
        ? '<div class="table-wrap"><table><thead><tr>' + fields.map((field) => '<th>' + escapeHtml(field) + '</th>').join('') + '</tr></thead><tbody>' +
          rows.slice(0, 200).map(({ record, index }) =>
            '<tr class="record-row' + (index === state.selectedRecordIndex ? ' selected' : '') + '" data-index="' + index + '">' +
              fields.map((field) => '<td>' + escapeHtml(cellValue(record[field])) + '</td>').join('') +
            '</tr>').join('') +
          '</tbody></table></div>' +
          (rows.length > 200 ? '<div class="empty" style="padding:12px 16px">Showing the first 200 matching records; refine the search to narrow further.</div>' : '')
        : '<div class="empty" style="padding:12px 16px">No records match the current filter.</div>';
      for (const row of document.querySelectorAll('#datasetRecords tr.record-row')) {
        row.addEventListener('click', () => {
          state.selectedRecordIndex = Number(row.dataset.index);
          renderDatasetRecords();
        });
      }
      renderRecordDetail();
    }
    function renderRecordDetail() {
      const container = document.getElementById('recordDetail');
      const record = state.dataset.records[state.selectedRecordIndex];
      if (state.selectedRecordIndex < 0 || !record) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = '<div class="panel-body"><h3>Record ' + (state.selectedRecordIndex + 1) + ' of ' + state.dataset.record_count + '</h3>' +
        '<div class="table-wrap"><table><tbody>' + Object.entries(record).map(([key, value]) =>
          '<tr><td style="width:220px"><strong>' + escapeHtml(key) + '</strong></td><td><pre class="mono">' + escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '</pre></td></tr>').join('') +
        '</tbody></table></div></div>';
    }
    async function applyHash() {
      const route = parseHash();
      if (route.view === 'setup') {
        await renderSetup(route.target);
        return;
      }
      if (route.view === 'settings') {
        await renderSettings();
        return;
      }
      if (route.view === 'shared') {
        await renderShared();
        return;
      }
      if (route.view === 'sector') {
        await renderSectorView(route.id);
        return;
      }
      if (route.view === 'dataset') {
        await openDataset(route.path, route.from);
        return;
      }
      setView(route.view);
      if (route.view === 'inspections') {
        renderSitesNav();
        if (state.selected && state.inspections.some((run) => run.inspection_id === state.selected)) await openRun(state.selected);
        else if (state.selectedSite) renderSiteView(state.selectedSite);
        else if (state.sites && state.sites.length) selectSite(state.sites[0].target_id);
      }
    }
    async function runAction(kind) {
      const selected = state.inspections.find((run) => run.inspection_id === state.selected);
      const body = { run_dir: selected?.output_dir };
      document.getElementById('actionResult').textContent = 'Starting ' + kind + '...';
      const result = await api('/api/' + kind, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      document.getElementById('actionResult').innerHTML = 'Started process ' + result.pid + '. Log: <a href="' + artifactHref(result.log_path) + '" target="_blank">' + escapeHtml(result.log_path) + '</a>';
      setTimeout(refresh, 1500);
    }
    document.getElementById('newInspectionBtn').addEventListener('click', () => { window.location.hash = '#setup'; });
    document.getElementById('tabInspections').addEventListener('click', () => { window.location.hash = '#inspections'; });
    document.getElementById('tabShared').addEventListener('click', () => { window.location.hash = '#shared'; });
    document.getElementById('tabSettings').addEventListener('click', () => { window.location.hash = '#settings'; });
    window.addEventListener('hashchange', () => applyHash().catch((error) => {
      document.getElementById('datasetView').innerHTML = '<div class="panel"><div class="panel-body">View failed to load: ' + escapeHtml(error.message) + '</div></div>';
    }));
    refresh().catch((error) => {
      document.getElementById('detail').innerHTML = '<div class="panel"><div class="panel-body">Dashboard failed to load: ' + escapeHtml(error.message) + '</div></div>';
    });
    applyHash().catch((error) => {
      document.getElementById('datasetView').innerHTML = '<div class="panel"><div class="panel-body">View failed to load: ' + escapeHtml(error.message) + '</div></div>';
    });
    pollQueue();
    setInterval(pollQueue, 4000);
  </script>
</body>
</html>`;
}

function parseCleanupPolicy(raw) {
  if (raw === 'all-runs') return { policy: 'all-runs' };
  if (raw === 'captures-only') return { policy: 'captures-only' };
  const match = String(raw || 'keep-latest-1').match(/^keep-latest-(\d+)$/);
  return { policy: 'keep-latest', keep: match ? Number(match[1]) : 1 };
}

function routeRequest(rootDir, request, response, queue) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/') {
    sendHtml(response, dashboardPage());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, {
      status: 'ok',
      service: 'ecommerce-inspection-dashboard',
      root_dir: rootDir
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/inspection-config') {
    try {
      sendJson(response, 200, loadInspectionConfig(rootDir, url.searchParams.get('target_id') || null));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/inspection-config') {
    readBody(request)
      .then((body) => {
        const saved = saveInspectionConfig(rootDir, body);
        if (body.run !== false) {
          const queued = queue.enqueue({ kind: 'inspect', label: 'Inspect: ' + (body.name || saved.target_id), argv: ['src/evaluator/run-inspection.mjs', '--evaluation', saved.evaluation] });
          sendJson(response, 202, { ...saved, ...queued, queued: true });
        } else {
          sendJson(response, 200, { ...saved, running: false });
        }
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/storage') {
    const preview = previewCleanup(rootDir, parseCleanupPolicy('keep-latest-1'));
    sendJson(response, 200, { total_runs: preview.total_runs });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/cleanup/preview') {
    readBody(request)
      .then((body) => sendJson(response, 200, previewCleanup(rootDir, parseCleanupPolicy(body.policy))))
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/cleanup/apply') {
    readBody(request)
      .then((body) => sendJson(response, 200, runCleanup(rootDir, parseCleanupPolicy(body.policy))))
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/sites') {
    sendJson(response, 200, listSites(rootDir));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/inspections') {
    sendJson(response, 200, inspections(rootDir));
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/inspection/')) {
    const inspectionId = decodeURIComponent(url.pathname.replace('/api/inspection/', ''));
    const row = latestHistoryRows(rootDir).find((entry) => entry.inspection_id === inspectionId);
    if (!row) {
      sendJson(response, 404, { error: `Inspection not found: ${inspectionId}` });
      return;
    }
    sendJson(response, 200, loadRun(rootDir, row.output_dir));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/datasets') {
    sendJson(response, 200, datasetCatalog(rootDir));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/site-data') {
    const data = siteDatasets(rootDir, url.searchParams.get('target'));
    if (!data) {
      sendJson(response, 404, { error: `Site not found: ${url.searchParams.get('target')}` });
      return;
    }
    sendJson(response, 200, data);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/site-health') {
    const health = siteHealth(rootDir, url.searchParams.get('target'));
    if (!health) {
      sendJson(response, 404, { error: `Site not found: ${url.searchParams.get('target')}` });
      return;
    }
    sendJson(response, 200, health);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/woo/catalog') {
    // Cached catalog summary (no external call) so the panel loads instantly.
    const summary = latestWooCatalog(rootDir, url.searchParams.get('target'));
    sendJson(response, 200, summary ? { captured: true, summary } : { captured: false });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/woo/search') {
    const adapter = wooAdapterForTarget(rootDir, url.searchParams.get('target'));
    const query = url.searchParams.get('q') || '';
    if (!adapter) { sendJson(response, 404, { error: 'Not a WooCommerce target.' }); return; }
    if (!query.trim()) { sendJson(response, 200, { query, result_count: 0, results: [] }); return; }
    adapter.fetchSubmittedSearch(query)
      .then((result) => sendJson(response, 200, { query: result.query, result_count: result.result_count, returned: result.returned, results: result.results }))
      .catch((error) => sendJson(response, 502, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/woo/autocomplete') {
    const adapter = wooAdapterForTarget(rootDir, url.searchParams.get('target'));
    const prefix = url.searchParams.get('q') || '';
    if (!adapter) { sendJson(response, 404, { error: 'Not a WooCommerce target.' }); return; }
    if (!prefix.trim()) { sendJson(response, 200, { prefix, suggestions: [] }); return; }
    adapter.fetchAutocomplete(prefix)
      .then((result) => sendJson(response, 200, { prefix: result.prefix, method: result.method, suggestion_count: result.suggestion_count, suggestions: result.suggestions }))
      .catch((error) => sendJson(response, 502, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/shared') {
    sendJson(response, 200, sharedData(rootDir));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/sector') {
    const view = sectorView(rootDir, url.searchParams.get('id'));
    if (!view) {
      sendJson(response, 404, { error: `Sector not found: ${url.searchParams.get('id')}` });
      return;
    }
    sendJson(response, 200, view);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/sector/promote') {
    readBody(request)
      .then((body) => sendJson(response, 200, promoteToSector(rootDir, body)))
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/sector/adopt') {
    readBody(request)
      .then((body) => sendJson(response, 200, adoptSector(rootDir, body)))
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/dataset') {
    try {
      const limit = Number(url.searchParams.get('limit'));
      const dataset = loadDataset(rootDir, url.searchParams.get('path'), limit);
      if (!dataset) {
        sendJson(response, 404, { error: 'Dataset not found.' });
        return;
      }
      sendJson(response, 200, dataset);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/compare') {
    sendJson(response, 200, compareRuns(rootDir, url.searchParams.get('left'), url.searchParams.get('right')));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/artifact') {
    try {
      const requested = url.searchParams.get('path');
      const filePath = safeResolve(rootDir, requested);
      if (!exists(filePath) || fs.statSync(filePath).isDirectory()) {
        sendText(response, 404, 'Artifact not found.');
        return;
      }
      response.writeHead(200, {
        'content-type': contentType(filePath),
        'cache-control': 'no-store'
      });
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      sendText(response, 400, error.message);
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/onboard') {
    readBody(request)
      .then((body) => {
        const result = onboardTarget(rootDir, { url: body.url, name: body.name });
        sendJson(response, result.created ? 201 : 200, result);
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/fix-plan') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        safeResolve(rootDir, body.run_dir);
        sendJson(response, 201, generateFixPlan(rootDir, body.run_dir));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/verify-fixes-live') {
    readBody(request)
      .then((body) => {
        if (!body.target_id) throw new Error('target_id is required.');
        sendJson(response, 202, queue.enqueue({ kind: 'verify', label: 'Verify fixes: ' + body.target_id, argv: ['src/evaluator/verify-fixes-live.mjs', body.target_id] }));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/queue') {
    sendJson(response, 200, queue.list());
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/queue/cancel') {
    readBody(request)
      .then((body) => {
        if (!body.id) throw new Error('id is required.');
        sendJson(response, 200, queue.cancel(body.id));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/queue/clear') {
    readBody(request).then(() => sendJson(response, 200, queue.clearPending())).catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/verify-fixes') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        safeResolve(rootDir, body.run_dir);
        sendJson(response, 200, verifyFixPlan(rootDir, body.run_dir));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/retry-capture') {
    readBody(request)
      .then(async (body) => {
        if (!body.run_dir || !body.plugin_id || !body.key) throw new Error('run_dir, plugin_id, and key are required.');
        safeResolve(rootDir, body.run_dir);
        const result = await retryCapture(rootDir, body);
        sendJson(response, 200, result);
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/curate-queries') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        safeResolve(rootDir, body.run_dir);
        const result = curateQueryPack(rootDir, body.run_dir);
        sendJson(response, 201, result);
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/executive-report') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        safeResolve(rootDir, body.run_dir);
        const result = generateExecutiveReport(rootDir, body.run_dir);
        if (latexmkAvailable()) {
          const rendered = renderExecutivePdf(rootDir, body.run_dir);
          result.pdf_path = rendered.pdf_path;
        } else {
          result.pdf_path = null;
          result.pdf_note = 'latexmk not available; PDF rendering skipped.';
        }
        sendJson(response, 201, result);
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/run') {
    readBody(request)
      .then((body) => {
        const evaluation = body.evaluation || 'evaluations/ridge-shopify-baseline.json';
        const args = ['src/evaluator/run-inspection.mjs', '--evaluation', evaluation];
        if (body.only) args.push('--only', body.only);
        sendJson(response, 202, queue.enqueue({ kind: 'inspect', label: 'Inspect: ' + evaluation.split('/').pop(), argv: args }));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/resume') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        safeResolve(rootDir, body.run_dir);
        sendJson(response, 202, queue.enqueue({ kind: 'resume', label: 'Resume: ' + body.run_dir.split('/').slice(-1)[0], argv: ['src/evaluator/run-inspection.mjs', '--resume', body.run_dir] }));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/rerun') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        const run = loadRun(rootDir, body.run_dir);
        const evaluation = run.checkpoint?.evaluation_manifest || run.run_manifest?.evaluation_manifest_path;
        if (!evaluation) throw new Error('Could not determine evaluation manifest for selected run.');
        const targetName = run.report?.target?.name || evaluation.split('/').pop();
        sendJson(response, 202, queue.enqueue({ kind: 'rerun', label: 'Rerun: ' + targetName, argv: ['src/evaluator/run-inspection.mjs', '--evaluation', evaluation] }));
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  sendText(response, 404, 'Not found.');
}

export function createDashboardServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const host = options.host || DEFAULT_HOST;
  const port = Number.isFinite(options.port) ? options.port : DEFAULT_PORT;
  const queue = new InspectionQueue(rootDir);
  const server = http.createServer((request, response) => {
    try {
      routeRequest(rootDir, request, response, queue);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        server,
        host,
        port: address.port,
        url: `http://${host}:${address.port}`
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const dashboard = await createDashboardServer(args);
  console.log(`Ecommerce inspection dashboard: ${dashboard.url}`);
}
