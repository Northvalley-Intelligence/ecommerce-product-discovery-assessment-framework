#!/usr/bin/env node

import { spawn, execFileSync } from 'node:child_process';
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
import { loadCustomDataset } from '../../framework/search-eval/scripts/load-custom-dataset.mjs';
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

// Parse an "Avg. monthly searches" cell (e.g. "1K – 10K", "1,000-10,000", "500") into a number.
function parseVolume(s) {
  if (!s) return null;
  const toks = String(s).match(/[\d,.]+\s*[KMkm]?/g);
  if (!toks) return null;
  const nums = toks.map((t) => {
    let n = parseFloat(t.replace(/,/g, ''));
    if (/[Kk]/.test(t)) n *= 1000;
    if (/[Mm]/.test(t)) n *= 1000000;
    return Math.round(n);
  }).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
}

// Parse a Google Keyword Planner paste (tab rows OR the 8-line-per-keyword web copy).
function parseKeywordPlanner(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = []; const skipped = [];
  const isHeader = (k) => /^keyword$/i.test(k) || /keyword ideas/i.test(k) || /^avg\.? monthly searches$/i.test(k);
  const tabbed = lines.length && lines.filter((l) => l.includes('\t')).length >= lines.length * 0.5;
  if (tabbed) {
    for (const line of lines) {
      const cells = line.split('\t').map((c) => c.trim());
      const kw = cells[0];
      if (!kw || isHeader(kw)) { skipped.push({ value: kw, reason: 'header/marker' }); continue; }
      const vol = cells.slice(1).find((c) => /\d/.test(c)) || '';
      rows.push({ keyword: kw, avg_monthly_searches: vol });
    }
  } else {
    const H = 8;
    for (let i = 0; i < lines.length;) {
      const kw = lines[i];
      if (isHeader(kw)) { skipped.push({ value: kw, reason: 'marker' }); i += 1; continue; }
      const cells = lines.slice(i, i + H);
      if (cells.length >= 2 && /\d/.test(cells[1]) && !/^https?:/i.test(kw)) { rows.push({ keyword: kw, avg_monthly_searches: cells[1] }); i += H; }
      else { skipped.push({ value: kw, reason: 'unrecognized row' }); i += 1; }
    }
  }
  return { rows, skipped };
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
    // WooCommerce and browser-eval sites are listed directly (their evidence
    // comes from the Store API or a browser-driven evaluation, not an evaluation
    // manifest).
    if (!evaluation && platform !== 'woocommerce' && platform !== 'browser-eval') continue;
    const latest = historyRows.find((row) => row.target_id === target.target_id) || null;
    sites.push({
      target_id: target.target_id,
      name: target.name,
      url: target.primary_url,
      platform,
      engine: target.platform?.engine || null,
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

// Latest browser-driven search evaluation (category<->synonym pairs) captured
// for a target, read from its assessment directory. No server-side fetching.
function latestSearchEval(rootDir, targetId) {
  const root = path.join(rootDir, 'assessments', targetId, 'search-eval');
  if (!exists(root)) return null;
  const runs = fs.readdirSync(root).filter((name) => exists(path.join(root, name, 'category-synonym-pairs.json'))).sort();
  if (!runs.length) return null;
  const dir = path.join(root, runs[runs.length - 1]);
  const pairs = readJson(path.join(dir, 'category-synonym-pairs.json'));
  const evalPath = path.join(dir, 'search-eval.json');
  return { pairs, eval: exists(evalPath) ? readJson(evalPath) : null };
}

// Combined dataset x retailer scoreboard (Home Improvement domain), read from
// the captured artifact. No server-side fetching of the retailers.
function latestSearchDatasets(rootDir) {
  const root = path.join(rootDir, 'assessments', 'search-datasets');
  if (!exists(root)) return null;
  const runs = fs.readdirSync(root).filter((name) => exists(path.join(root, name, 'datasets.json'))).sort();
  if (!runs.length) return null;
  return readJson(path.join(root, runs[runs.length - 1], 'datasets.json'));
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
    .exp { border: 1px solid var(--line); border-radius: 8px; background: white; margin-bottom: 6px; }
    .exp > summary { cursor: pointer; padding: 8px 11px; font-size: 13px; list-style: none; }
    .exp > summary::-webkit-details-marker { display: none; }
    .exp[open] > summary { border-bottom: 1px solid var(--line); }
    .exp-body { padding: 9px 11px; }
    .dsrow > summary .cx { display:inline-block; transition: transform .12s; color: var(--muted); }
    .dsrow[open] > summary .cx { transform: rotate(90deg); }
    .dsrow > summary:hover { background: #f8fafc; }
    .dshead { display:grid; gap:8px; align-items:center; padding: 4px 11px 6px; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .02em; }
    .sdot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; vertical-align: middle; margin-right: 3px; }
    .sdot.sev-severe, .sdot.sev-high { background: #dc2626; }
    .sdot.sev-medium { background: #d97706; }
    .sdot.sev-minor { background: #9ca3af; }
    .sdot.sev-pass { background: #16a34a; }
    .vchip { font-weight: 700; margin-left: 6px; }
    .vchip.vok { color: #16a34a; }
    .vchip.vfail { color: #dc2626; }
    .qc { color: #64748b; font-size: 12px; margin-left: 8px; }
    .qc b { color: #0f172a; }
    .dvg { font-size: 11px; color: #64748b; margin-left: 8px; }
    .evrow { padding: 2px 0; font-size: 12px; }
    .evrow code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
    .gbadge { display: inline-block; min-width: 14px; text-align: center; color: #fff; font-size: 11px; font-weight: 700; border-radius: 4px; padding: 0 4px; margin-right: 5px; }
    a.relink { color: var(--blue); text-decoration: none; font-size: 11px; margin-left: 6px; }
    a.relink:hover { text-decoration: underline; }
    .woo-replay { padding: 5px 10px; border: 1px solid var(--blue); background: var(--soft-blue); color: var(--blue); border-radius: 7px; cursor: pointer; font: inherit; font-size: 12px; }
    .woo-replay:hover { background: var(--blue); color: white; }
    a.jump { color: inherit; text-decoration: none; cursor: pointer; border-bottom: 2px dotted var(--blue); }
    a.jump:hover { color: var(--blue); }
    @keyframes flashbg { 0% { background: var(--soft-blue); } 100% { background: transparent; } }
    .flash { animation: flashbg 1.6s ease-out; border-radius: 12px; }
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
        : site.platform === 'browser-eval'
        ? 'browser eval · search'
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
      if (site.platform === 'browser-eval') { renderBrowserEvalSite(site); return; }
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
          '<div id="wooAutoResults" class="muted" style="margin-top:8px">Start typing to see suggestions.</div></div>') +
        '<div id="evalBoard"></div>';
      loadWooCatalog(targetId);
      wireWooSearch(targetId);
      loadEvalBoard(targetId);
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
      const facets = s.facets || null;
      const outcomePill = (o) => pill({ hit: 'pass', ok: 'pass', miss: 'fail', empty: 'warn' }[o] || 'muted-status', o);
      const bySurface = {};
      for (const e of (s.experiments || [])) { (bySurface[e.surface] = bySurface[e.surface] || []).push(e); }
      const callHtml = (e) => '<details class="exp"><summary>' + outcomePill(e.outcome) + ' <strong>' + escapeHtml(e.label) + '</strong> — ' + escapeHtml(String(e.result_count)) + ' result' + (e.result_count === 1 ? '' : 's') + ' <span class="muted">(HTTP ' + escapeHtml(String(e.status)) + ')</span></summary>' +
        '<div class="exp-body">' +
          '<div class="muted" style="font-size:12px">GET <span class="mono">' + escapeHtml(e.url) + '</span></div>' +
          (Object.keys(e.params || {}).length ? '<div class="muted" style="font-size:12px;margin-top:4px">Params: ' + Object.entries(e.params).map(([k, v]) => escapeHtml(k) + '=' + escapeHtml(String(v))).join(' · ') + '</div>' : '') +
          (e.sample && e.sample.length ? '<div class="muted" style="font-size:12px;margin-top:4px">Fetched: ' + e.sample.map(escapeHtml).join(', ') + '</div>' : '') +
          '<div style="margin-top:6px"><button class="woo-replay" data-url="' + escapeHtml(e.url) + '">Replay this call</button> <span class="replay-out muted" style="font-size:12px;margin-left:6px"></span></div>' +
        '</div></details>';
      const catalogCalls = bySurface['Catalog'] || [];
      const facetCalls = bySurface['Facets'] || [];
      const metrics =
        healthMetric('SKUs', (catalogCalls.length ? jumpNum(escapeHtml(String(s.sku_count)), 'cat-skus-ev', 'Expand the call behind this number') : escapeHtml(String(s.sku_count))), 'products (' + escapeHtml(s.sku_count_source || '') + ')') +
        healthMetric('Browse nodes', escapeHtml(String(s.browse_nodes)), s.browse_nodes_substantive + ' substantive · ' + s.browse_nodes_operational_heuristic + ' operational') +
        healthMetric('Facets', (facetCalls.length ? jumpNum(escapeHtml(String(facets ? facets.attribute_count : 0)), 'cat-facets-ev', 'Expand the calls behind this number') : escapeHtml(String(facets ? facets.attribute_count : 0))), (facets ? facets.filterable_count : 0) + ' filterable');
      const skuEvidence = catalogCalls.length ? '<div id="cat-skus-ev"><details class="exp"><summary><strong>Product-count call</strong> <span class="muted">— the X-WP-Total call behind SKUs</span></summary><div style="margin-top:6px">' + catalogCalls.map(callHtml).join('') + '</div></details></div>' : '';
      const facetEvidence = facetCalls.length ? '<div id="cat-facets-ev"><details class="exp"><summary><strong>Facet-term calls</strong> <span class="muted">— the ' + facetCalls.length + ' calls behind Facets</span></summary><div style="margin-top:6px">' + facetCalls.map(callHtml).join('') + '</div></details></div>' : '';
      el.innerHTML = panel('Catalog', 'What the store holds · click a number to see and replay the call behind it',
        '<div class="panel-body"><div class="metric-row">' + metrics + '</div>' +
        (skuEvidence || facetEvidence ? '<div style="margin-top:10px">' + skuEvidence + facetEvidence + '</div>' : '') +
        '</div>');
      wireJumps(el);
      for (const btn of el.querySelectorAll('.woo-replay')) {
        btn.addEventListener('click', async () => {
          const out = btn.parentElement.querySelector('.replay-out');
          out.textContent = 'Replaying…';
          try {
            const r = await api('/api/woo/replay?target=' + encodeURIComponent(targetId) + '&url=' + encodeURIComponent(btn.dataset.url));
            out.innerHTML = 'Replayed ' + escapeHtml((r.fetched_at || '').slice(11, 19)) + ': <strong>' + escapeHtml(String(r.result_count)) + '</strong> result' + (r.result_count === 1 ? '' : 's') + ' (HTTP ' + escapeHtml(String(r.status)) + ')' + (r.sample && r.sample.length ? ' — ' + r.sample.map(escapeHtml).join(', ') : '');
          } catch (error) { out.textContent = 'Replay failed: ' + error.message; }
        });
      }
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
    function evGradeColor(g) { return g >= 3 ? '#16a34a' : g >= 2 ? '#65a30d' : g >= 1 ? '#d97706' : '#dc2626'; }
    function evBadges(grades) {
      return (grades || []).map(function (g) { return '<span class="gbadge" style="background:' + evGradeColor(g) + '">' + g + '</span>'; }).join(' ');
    }
    // Shared per-dataset metric table used by BOTH the Industry West and Target boards, so every
    // retailer's board has the same structure (coverage + NDCG + grade + not-relevant), differing
    // only in how many stores it has and which metric the story emphasizes.
    function evMetricTable(datasets, storeKeys, storeName, metricOf, dsOrderArr, jumpPrefix) {
      var head = '<tr><th>Dataset</th><th>Store</th><th>Coverage</th><th>NDCG</th><th>Mean grade</th><th>Not-relevant</th></tr>';
      var body = datasets.slice().sort(function (a, b) { return dsOrderArr.indexOf(a.id) - dsOrderArr.indexOf(b.id); }).map(function (d) {
        return storeKeys.map(function (k, idx) {
          var ps = metricOf(d, k);
          var dcell = idx === 0 ? '<td>' + jumpNum('<strong>' + escapeHtml(d.name) + '</strong>', jumpPrefix + d.id, 'Jump to terms') + '</td>' : '<td></td>';
          if (!ps || ps.na) return '<tr>' + dcell + '<td>' + escapeHtml(storeName(k)) + '</td><td class="muted">—</td><td class="muted">—</td><td class="muted">—</td><td class="muted">—</td></tr>';
          var total = (ps.answered || 0) + (ps.zero || 0);
          var cov = total ? (ps.answered + '/' + total) : '—';
          var nd = ps.mean_ndcg == null ? '—' : Math.round(ps.mean_ndcg * 100) + '%';
          var gr = ps.mean_grade == null ? '—' : ps.mean_grade;
          var jkc = (ps.pct_not_relevant != null && ps.pct_not_relevant > 20) ? '#b91c1c' : '#111';
          var jk = ps.pct_not_relevant == null ? '—' : '<span style="color:' + jkc + '">' + ps.pct_not_relevant + '%</span>';
          return '<tr>' + dcell + '<td>' + escapeHtml(storeName(k)) + '</td><td>' + cov + '</td><td>' + nd + '</td><td><strong>' + gr + '</strong></td><td>' + jk + '</td></tr>';
        }).join('');
      }).join('');
      return '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    async function loadEvalBoard(targetId) {
      if (targetId !== 'industrywest') return;
      var el = document.getElementById('evalBoard');
      if (!el) return;
      var data;
      try { data = await api('/api/eval-board?eval=SE-20260713'); }
      catch (error) { el.innerHTML = ''; return; }
      if (state.selectedSite !== targetId) return;
      if (!data || !data.captured || !data.macro) { el.innerHTML = ''; return; }
      var m = data.macro;
      var stores = [['IW', data.stores.IW.name], ['SB', data.stores.SB.name]];
      var tIW = m.totals.IW, tSB = m.totals.SB;
      var totalsLine = '<p class="muted" style="font-size:12px;margin:0 0 10px">' + m.totals.search_calls_all + ' search calls · ' + m.totals.query_ndcg_evals_all + ' query NDCG evals · ' + m.totals.product_judgments_all + ' product judgments · 2 Cortex jobs</p>';
      var repro = data.reproducibility ? '<p class="muted" style="font-size:11px;margin:10px 0 0">Judge ' + escapeHtml(data.judge || '') + ' · rubric ' + escapeHtml(String(data.rubric_hash || '')) + ' · ' + escapeHtml(data.reproducibility.determinism || '') + '</p>' : '';
      var colOf = function (k) { return k === 'IW' ? '#2563eb' : '#0d9488'; };
      var worstFirst = function (a, b) {
        var an = a.ndcg_pinned == null ? 1 : a.ndcg_pinned, bn = b.ndcg_pinned == null ? 1 : b.ndcg_pinned;
        var aj = (a.grades_pinned || []).filter(function (g) { return g <= 1; }).length;
        var bj = (b.grades_pinned || []).filter(function (g) { return g <= 1; }).length;
        return (bj - aj) || (an - bn);
      };
      var termRowHtml = function (r) {
        var grades = r.grades_pinned && r.grades_pinned.length ? r.grades_pinned : r.grades;
        var junk = (grades || []).filter(function (g) { return g <= 1; }).length;
        var nd = r.ndcg_pinned == null ? '—' : Math.round(r.ndcg_pinned * 100) + '%';
        var flag = junk ? ' <span class="dvg" title="results graded not-relevant">' + junk + ' junk</span>' : '';
        var prods = (r.items || []).map(function (t, i) {
          var g = grades && grades[i] != null ? grades[i] : 0;
          return '<div class="evrow"><span class="gbadge" style="background:' + evGradeColor(g) + '">' + escapeHtml(String(g)) + '</span> ' + escapeHtml(t) + '</div>';
        }).join('');
        var replayBtn = r.store === 'IW'
          ? '<a class="relink" href="' + escapeHtml(r.search_call) + '" target="_blank" rel="noopener" title="Open the live Industry West storefront search">↗ open live search</a>'
          : '<a class="relink" href="https://sevenbonde.com/" target="_blank" rel="noopener" title="Open the live Seven Bonde site search">↗ open live search</a>';
        var rerunBtn = '<button class="woo-replay ev-rerun" data-store="' + escapeHtml(r.store) + '" data-q="' + escapeHtml(r.q) + '">Re-run NDCG</button>';
        return '<details class="exp"><summary><span class="qc" style="color:' + colOf(r.store) + '">' + escapeHtml(data.stores[r.store].name) + '</span> <strong>' + escapeHtml(r.q) + '</strong> <b>' + nd + '</b> <span class="muted" style="font-size:11px">' + r.total + ' results</span> ' + evBadges(grades) + flag + '</summary>' +
          '<div class="exp-body">' + prods +
          '<div style="margin-top:6px">' + replayBtn + ' ' + rerunBtn + ' <span class="ev-out muted" style="font-size:12px;margin-left:6px"></span></div>' +
          '</div></details>';
      };
      var verdictCard = function (key, sub, t, verdict) {
        var pct = t.search_calls ? Math.round(100 * t.answered / t.search_calls) : 0;
        var color = colOf(key);
        var junkColor = t.pct_not_relevant > 20 ? '#dc2626' : '#16a34a';
        return '<div style="flex:1 1 240px;border:1px solid #e5e7eb;border-radius:8px;padding:11px 13px">' +
          '<div style="font-weight:700;font-size:14px;color:' + color + '">' + escapeHtml(data.stores[key].name) + ' <span class="muted" style="font-weight:400;font-size:11px">' + escapeHtml(sub) + '</span></div>' +
          '<div style="display:flex;align-items:baseline;gap:6px;margin:6px 0 3px"><span style="font-size:25px;font-weight:700;color:' + color + '">' + pct + '%</span><span class="muted" style="font-size:12px">answered (' + t.answered + '/' + t.search_calls + ')</span></div>' +
          '<div style="background:#eef0f3;border-radius:4px;height:8px;overflow:hidden;margin:2px 0 8px"><div style="height:100%;width:' + pct + '%;background:' + color + '"></div></div>' +
          '<div style="font-size:12px">NDCG <b>' + Math.round(t.mean_ndcg * 100) + '%</b> · grade <b>' + t.mean_grade + '</b> · <b style="color:' + junkColor + '">' + t.pct_not_relevant + '%</b> not-relevant</div>' +
          '<div class="muted" style="font-size:12px;margin-top:6px">' + escapeHtml(verdict) + '</div>' +
        '</div>';
      };
      var verdictCards = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' +
        verdictCard('IW', 'legacy WooCommerce storefront', tIW, tIW.verdict || '') +
        verdictCard('SB', 'new Shopify (migrating to)', tSB, tSB.verdict || '') +
        '</div>';
      var covBar = function (ps, key) {
        var color = colOf(key);
        if (!ps || ps.na) return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:26px;font-size:11px;font-weight:600;color:' + color + '">' + key + '</span><span class="muted" style="font-size:11px">not run for this store</span></div>';
        var total = ps.answered + ps.zero;
        var pct = total ? Math.round(100 * ps.answered / total) : 0;
        var nd = ps.mean_ndcg == null ? '—' : Math.round(ps.mean_ndcg * 100) + '%';
        return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0">' +
          '<span style="width:26px;font-size:11px;font-weight:600;color:' + color + '">' + key + '</span>' +
          '<div style="flex:1;background:#eef0f3;border-radius:4px;height:15px;position:relative;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:' + color + ';opacity:.85"></div>' +
            '<span style="position:absolute;left:6px;top:0;font-size:10px;line-height:15px;color:#111">' + ps.answered + ' / ' + total + '</span>' +
          '</div>' +
          '<span class="qc" style="min-width:64px;text-align:right">NDCG ' + nd + '</span>' +
        '</div>';
      };
      var dsOrder = ['synonym', 'attribute', 'job_function', 'head', 'literal', 'intent'];
      var datasetBlocks = m.datasets.slice().sort(function (a, b) { return dsOrder.indexOf(a.id) - dsOrder.indexOf(b.id); }).map(function (d) {
        var allForDs = data.rows.filter(function (r) { return r.dataset === d.id; });
        var withResults = allForDs.filter(function (r) { return r.total > 0; }).sort(worstFirst);
        var zeros = allForDs.filter(function (r) { return r.total === 0; });
        var zerosByStore = {};
        zeros.forEach(function (r) { (zerosByStore[r.store] = zerosByStore[r.store] || []).push(r.q); });
        var zeroBlock = Object.keys(zerosByStore).map(function (store) {
          return '<div class="muted" style="font-size:11px;margin-top:6px;line-height:1.5"><span style="color:' + colOf(store) + ';font-weight:600">' + escapeHtml(data.stores[store].name) + '</span> returned nothing for: ' + zerosByStore[store].map(function (q) { return '<span style="color:#b91c1c">' + escapeHtml(q) + '</span>'; }).join(', ') + '</div>';
        }).join('');
        var terms = (withResults.length ? withResults.map(termRowHtml).join('') : '') + zeroBlock;
        return '<div id="evds-' + d.id + '" style="border-top:1px solid #eef0f3;padding:9px 0">' +
          '<div class="ds-head" data-ds="' + d.id + '" style="cursor:pointer"><span class="caret" data-ds="' + d.id + '" style="display:inline-block;width:12px;color:#888">▸</span> <strong>' + escapeHtml(d.name) + '</strong>' + (d.takeaway ? ' <span class="muted" style="font-size:12px">— ' + escapeHtml(d.takeaway) + '</span>' : '') + '</div>' +
          '<div class="ds-terms" data-ds="' + d.id + '" style="display:none;padding:6px 0 2px 16px">' + terms + '</div>' +
        '</div>';
      }).join('');
      var metricTable = evMetricTable(m.datasets, ['IW', 'SB'], function (k) { return data.stores[k].name; }, function (d, k) { return d.per_store[k]; }, dsOrder, 'evds-');
      var kpKeep = { synonym: 1, attribute: 1, job_function: 1, head: 1 };
      var kpTerms = [];
      data.rows.forEach(function (r) { if (r.store === 'IW' && kpKeep[r.dataset] && kpTerms.indexOf(r.q) < 0) kpTerms.push(r.q); });
      var kpLine = kpTerms.join(', ');
      var copyLine = '<p style="font-size:12px;margin:0 0 8px"><button class="woo-replay" id="copyTermsBtn">Copy search terms</button> <span class="muted" style="font-size:11px">' + kpTerms.length + ' terms, comma-separated — paste into Google Keyword Planner</span> <span id="copyTermsOut" class="muted" style="font-size:12px;margin-left:6px"></span></p>';
      var pasteLine = '<div style="margin:0 0 12px"><details class="exp"><summary style="font-size:12px">Paste Keyword Planner results here to add demand data</summary><div style="margin-top:6px"><textarea id="kpPaste" placeholder="Paste the Keyword Planner table (keyword + Avg. monthly searches ...)" style="width:100%;min-height:90px;font:inherit;font-size:12px;padding:6px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px"></textarea><div style="margin-top:6px"><button class="woo-replay" id="kpImportBtn">Import &amp; validate</button> <span id="kpImportOut" class="muted" style="font-size:12px;margin-left:6px"></span></div><div id="kpResult" style="margin-top:8px"></div></div></details></div>';
      var reportLine = '<p style="font-size:13px;margin:0 0 9px"><a class="relink" href="' + artifactHref('reports/industrywest-search-relevance-report.pdf') + '&t=' + Date.now() + '" target="_blank" rel="noopener"><strong>Download the search-relevance report (PDF)</strong></a> <span class="muted" style="font-size:11px">— 5 pages, demand-ranked</span></p>';
      var boardPanel = panel('Search relevance — Industry West vs Seven Bonde', 'Seven Bonde is the store Industry West is migrating to · click a dataset to expand its terms · coverage + NDCG + grade quality',
        '<div class="panel-body">' + totalsLine + reportLine + copyLine + pasteLine + verdictCards + metricTable + '<div style="margin-top:12px">' + datasetBlocks + '</div>' + repro + '</div>');
      var cc = data.catalog_context;
      var chip = function (x) { return '<span class="qc" style="margin:1px 3px 1px 0;display:inline-block">' + escapeHtml(x.name) + ' ' + x.count + '</span>'; };
      var stockPanel = cc ? panel('Stock context (guardrail)', 'For reading zero-results — a zero on a stocked type or material is a recall bug; an absent one (e.g. no sofa) is out of assortment',
        '<div class="panel-body"><div class="muted" style="font-size:11px;margin-bottom:3px">Types stocked</div><div>' + (cc.types || []).map(chip).join('') + '</div>' +
        '<div class="muted" style="font-size:11px;margin:8px 0 3px">Materials stocked</div><div>' + (cc.materials || []).map(chip).join('') + '</div></div>') : '';
      var fnd = data.findings || [];
      var sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
      var sevPill = function (sev) { return pill(({ Critical: 'fail', High: 'fail', Medium: 'warn', Low: 'warn', Info: 'muted-status' })[sev] || 'warn', sev); };
      var findingsPanel = fnd.length ? panel('Findings', 'From the catalog calls and the search-relevance evaluation · severity-ranked · no fixes for now',
        '<div class="table-wrap"><table><thead><tr><th>Severity</th><th>Area</th><th>Finding</th></tr></thead><tbody>' +
        fnd.slice().sort(function (a, b) { return (sevRank[a.severity] == null ? 5 : sevRank[a.severity]) - (sevRank[b.severity] == null ? 5 : sevRank[b.severity]); }).map(function (f) {
          return '<tr><td>' + sevPill(f.severity) + '</td><td><strong>' + escapeHtml(f.area) + '</strong></td><td><strong>' + escapeHtml(f.title) + '</strong><div class="muted" style="font-size:12px;margin-top:2px">' + escapeHtml(f.detail) + '</div></td></tr>';
        }).join('') + '</tbody></table></div>') : '';
      el.innerHTML = stockPanel + boardPanel + findingsPanel;
      wireJumps(el);
      var copyBtn = el.querySelector('#copyTermsBtn');
      if (copyBtn) copyBtn.addEventListener('click', function () {
        var out = el.querySelector('#copyTermsOut');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(kpLine).then(function () { out.textContent = 'Copied ' + kpTerms.length + ' terms to clipboard'; }, function () { out.textContent = 'Copy failed'; });
        } else { out.textContent = 'Clipboard not available in this browser'; }
      });
      var importBtn = el.querySelector('#kpImportBtn');
      if (importBtn) importBtn.addEventListener('click', async function () {
        var out = el.querySelector('#kpImportOut'); var resDiv = el.querySelector('#kpResult');
        var pasteEl = el.querySelector('#kpPaste'); var paste = pasteEl ? pasteEl.value : '';
        if (!paste.trim()) { out.textContent = 'Paste the Keyword Planner output first.'; return; }
        out.textContent = 'Parsing and validating…'; resDiv.innerHTML = '';
        try {
          var r = await api('/api/demand/import?retailer=industrywest&eval=SE-20260713', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paste: paste }) });
          if (!r.ok) { out.textContent = r.error || 'Could not parse the paste.'; return; }
          out.innerHTML = 'Parsed <strong>' + r.parsed + '</strong> rows · matched <strong>' + r.matched + '</strong> of our terms' + (r.unmatched_kp_count ? ' · ' + r.unmatched_kp_count + ' KP terms not in our set' : '') + (r.terms_without_data_count ? ' · ' + r.terms_without_data_count + ' of our terms had no volume' : '');
          if (r.top_opportunities && r.top_opportunities.length) {
            resDiv.innerHTML = '<div class="muted" style="font-size:11px;margin-bottom:3px">Top opportunities — highest demand where search underperforms (returns nothing or shallow results):</div><div class="table-wrap"><table><thead><tr><th>Term</th><th>Monthly volume</th><th>Issue</th></tr></thead><tbody>' + r.top_opportunities.map(function (o) { return '<tr><td><strong>' + escapeHtml(o.term) + '</strong></td><td>' + escapeHtml(String(o.volume_display)) + '</td><td>' + escapeHtml(o.issue) + '</td></tr>'; }).join('') + '</tbody></table></div>';
          } else { resDiv.innerHTML = '<div class="muted" style="font-size:12px;margin-top:4px">No high-demand failing terms in this batch.</div>'; }
        } catch (error) { out.textContent = 'Import failed: ' + error.message; }
      });
      var dsHeads = el.querySelectorAll('.ds-head');
      for (var h = 0; h < dsHeads.length; h++) {
        (function (head) {
          head.addEventListener('click', function () {
            var ds = head.getAttribute('data-ds');
            var terms = el.querySelector('.ds-terms[data-ds="' + ds + '"]');
            var caret = el.querySelector('.caret[data-ds="' + ds + '"]');
            if (terms) { var isOpen = terms.style.display !== 'none'; terms.style.display = isOpen ? 'none' : 'block'; if (caret) caret.textContent = isOpen ? '▸' : '▾'; }
          });
        })(dsHeads[h]);
      }
      var replayBtns = el.querySelectorAll('.ev-replay');
      for (var i = 0; i < replayBtns.length; i++) {
        (function (btn) {
          btn.addEventListener('click', async function () {
            var out = btn.parentElement.querySelector('.ev-out');
            out.textContent = 'Replaying search…';
            try {
              var rr = await api('/api/woo/replay?target=industrywest&url=' + encodeURIComponent(btn.dataset.url));
              out.innerHTML = 'Live: <strong>' + escapeHtml(String(rr.result_count)) + '</strong> results (HTTP ' + escapeHtml(String(rr.status)) + ')' + (rr.sample && rr.sample.length ? ' — ' + rr.sample.map(escapeHtml).join(', ') : '');
            } catch (error) { out.textContent = 'Replay failed: ' + error.message; }
          });
        })(replayBtns[i]);
      }
      var rerunBtns = el.querySelectorAll('.ev-rerun');
      for (var j = 0; j < rerunBtns.length; j++) {
        (function (btn) {
          btn.addEventListener('click', async function () {
            var out = btn.parentElement.querySelector('.ev-out');
            out.textContent = 'Re-running NDCG via Cortex…';
            try {
              var rr = await api('/api/eval/rerun-ndcg?eval=SE-20260713&store=' + encodeURIComponent(btn.dataset.store) + '&q=' + encodeURIComponent(btn.dataset.q));
              if (!rr.rerun) { out.textContent = rr.reason || 'not re-run'; return; }
              var same = rr.matches ? 'matches stored' : 'CHANGED vs stored';
              var color = rr.matches ? '#16a34a' : '#dc2626';
              var extra = rr.matches ? '' : ' (was [' + escapeHtml((rr.stored_grades || []).join(',')) + '])';
              out.innerHTML = 'NDCG <strong>' + Math.round(rr.ndcg * 100) + '%</strong> grades [' + escapeHtml((rr.grades || []).join(',')) + '] rubric ' + escapeHtml(String(rr.rubric_hash || '').slice(0, 10)) + ' — <span style="color:' + color + '">' + same + extra + '</span>';
            } catch (error) { out.textContent = 'Re-run failed: ' + error.message; }
          });
        })(rerunBtns[j]);
      }
    }
    function renderBrowserEvalSite(site) {
      const targetId = site.target_id;
      document.getElementById('detail').innerHTML =
        '<div class="crumb-bar"><span class="crumb-current">Sites › ' + escapeHtml(site.name) + '</span><span class="muted">— browser-driven search evaluation</span></div>' +
        '<section class="hero"><div><p class="eyebrow">Browser-Evaluated Site</p><h1>' + escapeHtml(site.name) + '</h1>' +
          '<div class="subline"><span>' + escapeHtml(site.url) + '</span><span>' + escapeHtml(site.engine || 'enterprise (Akamai)') + '</span><span><a href="' + escapeHtml(site.url) + '" target="_blank" rel="noopener">Open store</a></span></div>' +
          '<p class="muted" style="margin:8px 0 0;font-size:12px">' + (site.engine ? 'Search evaluated by reading the store’s own search responses for a bounded query set — no crawling.' : 'No API engine (bot wall). Search evaluated by reading the browser-embedded search response for a bounded query set — no crawling, no API calls, no token replay.') + '</p></div></section>' +
        '<div id="searchEval"><div class="empty">Loading search datasets…</div></div>';
      // Retailers with a graded relevance eval-board render that; others use the HD/Lowe's scoreboard.
      var evalBoards = { target: 'SE-20260808', catfootwear: 'SE-20260810', partscat: 'SE-20260812', biggreenegg: 'SE-20261012T184220Z' };
      if (evalBoards[targetId]) loadRetailBoard(targetId, targetId, evalBoards[targetId]);
      else loadSearchScoreboard(targetId);
    }
    async function loadRetailBoard(targetId, retailer, evalId) {
      var el = document.getElementById('searchEval');
      if (!el) return;
      var data;
      try { data = await api('/api/eval-board?retailer=' + encodeURIComponent(retailer) + '&eval=' + encodeURIComponent(evalId)); }
      catch (error) { el.innerHTML = panel('Search relevance', '', '<div class="panel-body"><div class="empty">No eval board captured yet.</div></div>'); return; }
      if (state.selectedSite !== targetId) return;
      if (!data || !data.captured || !data.datasets) { el.innerHTML = panel('Search relevance', '', '<div class="panel-body"><div class="empty">No eval board.</div></div>'); return; }
      // 8-stage pipeline strip — where this assessment stands against its contracts.
      var stageStatus = null;
      try { stageStatus = await api('/api/pipeline-status?retailer=' + encodeURIComponent(retailer) + '&eval=' + encodeURIComponent(evalId)); } catch (e) { stageStatus = null; }
      var stageStripHtml = (function () {
        if (!stageStatus || !stageStatus.stages) return '';
        var col = { ok: '#16a34a', missing: '#9ca3af', 'gate-failed': '#dc2626', invalid: '#dc2626', blocked: '#a855f7', unreadable: '#dc2626', legacy: '#d97706' };
        var chips = stageStatus.stages.map(function (s) {
          var c = col[s.state] || '#9ca3af';
          return '<div title="' + escapeHtml(s.skill + ' — ' + s.label + (s.file ? ' (' + s.file + ')' : '')) + '" style="flex:1 1 0;min-width:0;border-top:3px solid ' + c + ';background:#f8fafc;border-radius:5px;padding:5px 7px">' +
            '<div style="font-size:9px;color:#9ca3af">' + s.n + '</div>' +
            '<div style="font-size:10px;font-weight:600;color:' + (s.state === 'ok' ? '#111' : '#6b7280') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(s.skill.replace(/-/g, ' ')) + '</div>' +
            '<div style="font-size:9px;font-weight:700;color:' + c + '">' + escapeHtml(s.state === 'ok' ? '✓ ok' : s.label) + '</div></div>';
        }).join('');
        return panel('Pipeline — ' + stageStatus.done + '/' + stageStatus.total + ' stages meeting contract', 'catalog → dataset → engine profile → capture → grade → verify → board → report', '<div class="panel-body"><div style="display:flex;gap:6px;align-items:stretch">' + chips + '</div></div>');
      })();
      var gcol = function (g) { return g >= 3 ? '#16a34a' : g >= 2 ? '#65a30d' : g >= 1 ? '#d97706' : '#dc2626'; };
      var badges = function (gs) { return (gs || []).map(function (g) { return '<span class="gbadge" style="background:' + gcol(g) + '">' + g + '</span>'; }).join(' '); };
      var ov = data.overall || {};
      // Retailer-agnostic: store, brand, paths all come from the board data.
      var storeKey = Object.keys(data.stores || {})[0] || 'ST';
      var store = (data.stores && data.stores[storeKey]) || { name: retailer, platform: '' };
      var brand = data.brand_color || '#cc0000';
      var brandInk = data.brand_ink || brand;
      var pdfLink = data.has_report === false ? '' : '<p style="font-size:13px;margin:0 0 9px"><a class="relink" href="' + artifactHref('reports/' + retailer + '-search-relevance-report.pdf') + '&t=' + Date.now() + '" target="_blank" rel="noopener"><strong>Download the search-relevance report (PDF)</strong></a></p>';
      // Verdict card — same component as the Industry West board (single store here).
      var jcol = (ov.pct_not_relevant != null && ov.pct_not_relevant > 20) ? '#dc2626' : '#16a34a';
      var covLine = ov.coverage_pct != null ? ' · <b>' + ov.coverage_pct + '%</b> coverage' + (ov.zero_terms ? ' (' + ov.zero_terms + ' zero-result)' : '') : '';
      var head = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px"><div style="flex:1 1 240px;border:1px solid #e5e7eb;border-radius:8px;padding:11px 13px">' +
        '<div style="font-weight:700;font-size:14px;color:' + brandInk + '">' + escapeHtml(store.name) + ' <span class="muted" style="font-weight:400;font-size:11px">' + escapeHtml(store.platform || '') + '</span></div>' +
        '<div style="display:flex;align-items:baseline;gap:6px;margin:6px 0 3px"><span style="font-size:25px;font-weight:700;color:' + brandInk + '">' + (ov.mean_grade != null ? ov.mean_grade : '—') + '<span style="font-size:14px">/3</span></span><span class="muted" style="font-size:12px">mean grade · <b style="color:' + jcol + '">' + (ov.pct_not_relevant != null ? ov.pct_not_relevant + '%</b> not-relevant' : '') + ' (' + (ov.product_judgments || 0) + ' judgments)' + covLine + '</span></div>' +
        '<div style="background:#eef0f3;border-radius:4px;height:8px;overflow:hidden;margin:2px 0 8px"><div style="height:100%;width:' + Math.round((ov.mean_grade || 0) / 3 * 100) + '%;background:' + brand + '"></div></div>' +
        '<div class="muted" style="font-size:12px">' + escapeHtml(data.verdict || data.headline || '') + '</div></div></div>';
      var dsOrder = ['synonym', 'attribute', 'job_function', 'intent', 'literal', 'head'];
      var tableCaption = '<p class="muted" style="font-size:11px;margin-top:8px">' + (ov.coverage_pct != null && ov.coverage_pct < 98 ? 'Coverage ' + ov.coverage_pct + '% — a recall-style engine that returns nothing on a miss; weight zero-result rate and assortment classification, not just grade. ' : 'Coverage ~100% (answers nearly every query), so NDCG looks strong while mean grade reveals shallow answers. ') + 'Judge ' + escapeHtml(String(data.judge || 'llama3.2:3b')) + ' @ temp 0 · rubric ' + escapeHtml(String(data.rubric_hash || '')) + '.</p>';
      var worstFirst = function (a, b) { return (a.mean_grade == null ? 9 : a.mean_grade) - (b.mean_grade == null ? 9 : b.mean_grade); };
      var DSCOLS = 'grid-template-columns:minmax(160px,2fr) 84px 64px 96px 104px 76px';
      var groups = data.datasets.slice().sort(function (a, b) { return dsOrder.indexOf(a.id) - dsOrder.indexOf(b.id); }).map(function (d) {
        var rs = (data.rows || []).filter(function (r) { return r.dataset === d.id; }).sort(worstFirst);
        var clsColor = { search_bug: '#dc2626', assortment_gap: '#6b7280', shallow_answer: '#d97706', true_empty: '#6b7280', capture_artifact: '#7c3aed', brand_redirect: '#2563eb' };
        // answer-key size by term (so a synonym's canonical category size is available to the story)
        var keyByTerm = {}; (data.rows || []).forEach(function (rr) { if (rr.key_size) keyByTerm[String(rr.q).toLowerCase()] = rr.key_size; });
        var terms = rs.map(function (r) {
          var grades = (r.grades_pinned && r.grades_pinned.length) ? r.grades_pinned : (r.grades || []);
          var g = r.mean_grade, tot = r.total, ks = r.key_size, rec = r.recall, ct = r.compared_to;
          var canonKey = ct ? keyByTerm[String(ct).toLowerCase()] : null;
          var hits = (rec != null && ks) ? Math.round(rec * ks) : null;
          var qual = g == null ? '—' : (g >= 2.3 ? 'strong' : g >= 1.5 ? 'mixed' : g >= 0.8 ? 'poor' : 'irrelevant');
          var prods = (r.items || []).map(function (t, i) { var gg = grades[i] != null ? grades[i] : 0; return '<div class="evrow"><span class="gbadge" style="background:' + gcol(gg) + '">' + gg + '</span> ' + escapeHtml(t) + '</div>'; }).join('');
          var live = '<a class="relink" href="' + escapeHtml(r.search_call) + '" target="_blank" rel="noopener">↗ open live search</a>';
          // the story — assembled from everything we now know about the term
          var story;
          if (r.classification === 'assortment_gap') {
            story = (tot === 0)
              ? 'Cat makes no <strong>' + escapeHtml(r.q) + '</strong> — correctly returns nothing. An <b>assortment gap</b> (merchandising), not a search bug.'
              : 'Cat makes no <strong>' + escapeHtml(r.q) + '</strong>, yet search returns <b>' + tot + ' ' + qual + '</b> results (grade ' + (g != null ? g : '—') + '/3)' + (ct && canonKey ? ', instead of surfacing its nearest real category <b>' + escapeHtml(ct) + '</b> (' + canonKey + ' products)' : '') + '. The shopper gets ' + qual + ' matches rather than the ' + (ct ? escapeHtml(ct) : 'nearest category') + '.';
          } else if (r.classification === 'search_bug') {
            story = '<b style="color:#dc2626">Returns nothing</b>, but Cat stocks it' + (ks ? ' (' + ks + ' matching products exist)' : '') + ' — a search bug (broken recall).';
          } else if (r.classification === 'shallow_answer') {
            story = (rec != null && ks)
              ? '<strong>' + escapeHtml(r.q) + '</strong>: ' + tot + ' results at grade ' + g + '/3; <b>recall ' + Math.round(rec * 100) + '%</b> — found ' + hits + ' of the ' + ks + ' matching products, <b>missing ' + (ks - hits) + '</b>.'
              : '<strong>' + escapeHtml(r.q) + '</strong>: ' + tot + ' results, grade ' + g + '/3 — the right type but weak matches.';
          } else {
            story = (rec != null && ks)
              ? '<strong>' + escapeHtml(r.q) + '</strong>: ' + tot + ' results, grade ' + (g != null ? g : '—') + '/3, <b>recall ' + Math.round(rec * 100) + '%</b> — returned ' + hits + ' of ' + ks + ' matching products.'
              : '<strong>' + escapeHtml(r.q) + '</strong>: ' + tot + ' results, grade ' + (g != null ? g : '—') + '/3.';
          }
          // recall bar (returned vs answer key)
          var recallBar = (rec != null && ks) ? '<div style="margin:6px 0"><div style="font-size:10px;color:#6b7280;margin-bottom:2px">recall — search returned <b>' + hits + '</b> of the <b>' + ks + '</b> matching products' + (r.key_confidence ? ' · ' + r.key_confidence + '-confidence key' : '') + '</div><div style="background:#eef0f3;border-radius:3px;height:8px;overflow:hidden;max-width:300px"><div style="height:100%;width:' + Math.round(rec * 100) + '%;background:' + (rec < 0.5 ? '#dc2626' : rec < 0.8 ? '#d97706' : '#16a34a') + '"></div></div></div>' : '';
          // per-term selection source — how the term entered the dataset (category-recall skill §6).
          // One chip on every term, with a tooltip for any label that is not self-explanatory.
          var selMeta = {
            catalog_node: { label: 'catalog', color: 'background:#dcfce7;color:#166534', title: 'Selected from the store’s own catalog — matches a real category node the store organizes products under.' },
            catalog_facet: { label: 'facet', color: 'background:#ccfbf1;color:#115e59', title: 'Synthesized from a catalog filter value — a refinement (feature/size) the store exposes.' },
            authored: { label: 'authored', color: 'background:#fef3c7;color:#92400e', title: 'Hand-authored shopper vocabulary the catalog has no category for — chosen to test whether search maps it.' },
            use_case: { label: 'use-case', color: 'background:#ede9fe;color:#5b21b6', title: 'A job/task phrasing (e.g. “boots for standing all day”) — tests whether search understands the use case.' },
            natural_language: { label: 'natural language', color: 'background:#e0e7ff;color:#3730a3', title: 'A conversational, full-sentence query — tests natural-language understanding.' },
            part_number: { label: 'part number', color: 'background:#fee2e2;color:#991b1b', title: 'An exact known-item part-number lookup — the head of parts-catalog demand, not answer-key-generable.' },
            mined: { label: 'mined', color: 'background:#dbeafe;color:#1e40af', title: 'Discovered from search-result gaps (recall misses), not hand-picked.' },
          };
          var sm = selMeta[r.source] || selMeta.authored;
          var selTag = ' <span style="font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;white-space:nowrap;' + sm.color + '" title="' + sm.title + '">' + sm.label + '</span>';
          var nodeRef = (r.node_name && r.node_size > 0)
            ? ' <span class="muted" style="font-size:11px" title="the catalog category node this term maps to, and how many products it holds">= <b>' + escapeHtml(r.node_name) + '</b> node (' + r.node_size + ' products)</span>'
            : '';
          var cmp = ct ? (r.is_lead ? ' <span class="muted" style="font-size:11px">◆ canonical</span>' + nodeRef : ' <span class="muted" style="font-size:11px">↔ vs “' + escapeHtml(ct) + '”' + (canonKey ? ' (' + canonKey + ')' : '') + '</span>' + nodeRef) : nodeRef;
          var cls = r.classification ? ' <span style="font-size:10px;font-weight:700;color:#fff;background:' + (clsColor[r.classification] || '#6b7280') + ';border-radius:3px;padding:1px 5px">' + escapeHtml(r.classification.replace(/_/g, ' ')) + '</span>' : '';
          var ver = r.verified ? ' <span class="muted" style="font-size:11px" title="independently verified via live UI">✓ ' + escapeHtml(r.verified) + '</span>' : '';
          var metric = (rec != null && ks) ? '<span class="muted" style="font-size:11px">recall <b style="color:' + (rec < 0.5 ? '#dc2626' : '#16a34a') + '">' + Math.round(rec * 100) + '%</b> · ' + tot + ' shown</span>' : '<span class="muted" style="font-size:11px">' + escapeHtml(String(tot)) + ' results</span>';
          return '<details class="exp"><summary><strong>' + escapeHtml(r.q) + '</strong>' + selTag + cmp + cls + ver + ' <b>grade ' + (g != null ? g : '—') + '</b> ' + metric + ' ' + badges(grades) + '</summary><div class="exp-body"><div style="font-size:12px;line-height:1.5;margin-bottom:2px;padding:7px 9px;background:#f8fafc;border-left:3px solid ' + (clsColor[r.classification] || '#94a3b8') + ';border-radius:3px">' + story + '</div>' + recallBar + prods + '<div style="margin-top:6px">' + live + '</div></div></details>';
        }).join('');
        // one combined expandable row: the dataset's summary metrics ARE the header; expanding reveals its terms.
        var cov = (d.terms - (d.zero || 0)) + '/' + d.terms;
        var ndp = d.mean_ndcg == null ? '—' : Math.round(d.mean_ndcg * 100) + '%';
        var grd = d.mean_grade == null ? '—' : d.mean_grade;
        var nrCol = (d.pct_not_relevant != null && d.pct_not_relevant > 20) ? '#b91c1c' : 'inherit';
        var nrp = d.pct_not_relevant == null ? '—' : '<span style="color:' + nrCol + '">' + d.pct_not_relevant + '%</span>';
        var recp = d.mean_recall == null ? '<span class="muted" title="no answer key for this dataset — judged on relevance grade only">n/a</span>' : '<b style="color:' + (d.mean_recall < 0.5 ? '#dc2626' : '#16a34a') + '">' + Math.round(d.mean_recall * 100) + '%</b>';
        return '<details class="exp dsrow" id="tds-' + d.id + '"><summary style="display:grid;' + DSCOLS + ';align-items:center;gap:8px;font-size:13px">' +
          '<span><span class="cx">▸</span> <strong>' + escapeHtml(d.name) + '</strong> <span class="muted" style="font-size:11px">' + d.terms + ' terms</span></span>' +
          '<span>' + cov + '</span><span>' + ndp + '</span><span><strong>' + grd + '</strong></span><span>' + nrp + '</span><span>' + recp + '</span>' +
          '</summary><div style="margin-top:2px">' + terms + '</div></details>';
      }).join('');
      // shared grid template for the combined table header + each dataset row
      var combinedHead = '<div class="dshead" style="' + DSCOLS + '"><span>Dataset</span><span>Coverage</span><span>NDCG</span><span>Mean grade</span><span>Not-relevant</span><span>Recall</span></div>';
      var invalidBanner = data.invalidated ? '<div style="border:2px solid #dc2626;background:#fef2f2;border-radius:8px;padding:11px 13px;margin-bottom:12px"><div style="font-weight:700;color:#b91c1c;font-size:13px">⚠ INVALIDATED — contaminated capture, do not use these findings</div><div class="muted" style="font-size:12px;margin-top:4px">' + escapeHtml(data.invalidated.reason) + '</div></div>' : '';
      // Demand overlay affordance — operator pastes Google Keyword Planner volumes to rank fixes by demand (same as Industry West).
      var kpKeep = { synonym: 1, attribute: 1, job_function: 1, intent: 1 };
      var kpTerms = [];
      (data.rows || []).forEach(function (r) { if (kpKeep[r.dataset] && kpTerms.indexOf(r.q) < 0) kpTerms.push(r.q); });
      var kpLine = kpTerms.join(', ');
      var copyLine = '<p style="font-size:12px;margin:0 0 8px"><button class="woo-replay" id="copyTermsBtnT">Copy search terms</button> <span class="muted" style="font-size:11px">' + kpTerms.length + ' terms, comma-separated — paste into Google Keyword Planner</span> <span id="copyTermsOutT" class="muted" style="font-size:12px;margin-left:6px"></span></p>';
      var pasteLine = '<div style="margin:0 0 12px"><details class="exp"><summary style="font-size:12px">Demand overlay — paste Keyword Planner results to rank fixes by search volume</summary><div style="margin-top:6px"><textarea id="kpPasteT" placeholder="Paste the Keyword Planner table (keyword + Avg. monthly searches ...)" style="width:100%;min-height:90px;font:inherit;font-size:12px;padding:6px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px"></textarea><div style="margin-top:6px"><button class="woo-replay" id="kpImportBtnT">Import &amp; validate</button> <span id="kpImportOutT" class="muted" style="font-size:12px;margin-left:6px"></span></div><div id="kpResultT" style="margin-top:8px"></div></div></details></div>';
      // Findings panel (severity-ranked) from the evaluation.
      var fnd = data.findings || [];
      var sevRank = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
      var sevPill = function (sev) { return pill(({ Critical: 'fail', High: 'fail', Medium: 'warn', Low: 'warn', Info: 'muted-status' })[sev] || 'warn', sev); };
      var findingsPanel = fnd.length ? panel('Findings', 'From the ' + (ov.terms || '') + '-term search-relevance evaluation · severity-ranked · fix candidates noted',
        '<div class="table-wrap"><table><thead><tr><th>Severity</th><th>Area</th><th>Finding</th></tr></thead><tbody>' +
        fnd.slice().sort(function (a, b) { return (sevRank[a.severity] == null ? 5 : sevRank[a.severity]) - (sevRank[b.severity] == null ? 5 : sevRank[b.severity]); }).map(function (f) {
          return '<tr><td>' + sevPill(f.severity) + '</td><td><strong>' + escapeHtml(f.area) + '</strong></td><td><strong>' + escapeHtml(f.title) + '</strong><div class="muted" style="font-size:12px;margin-top:2px">' + escapeHtml(f.detail) + '</div></td></tr>';
        }).join('') + '</tbody></table></div>') : '';
      // Revenue-at-risk panel (modeled estimate from real Keyword Planner volumes × grades).
      var rl = data.revenue_loss;
      var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
      var moneyC = function (n) { return n >= 1e6 ? '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n); };
      var revenuePanel = '';
      if (rl && rl.model === 'online_sales_anchored') {
        revenuePanel = panel('Revenue at risk — cross-reference coverage gap', 'Online-sales-anchored · competitor cross-reference searches return zero · a modeled range, not audited revenue',
          '<div class="panel-body"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
          '<div style="border:2px solid #cc0000;border-radius:8px;padding:11px 16px;background:#fff5f5"><div class="muted" style="font-size:11px">Recoverable / yr (base)</div><div style="font-size:30px;font-weight:800;color:#cc0000">' + moneyC(rl.annual_lost.base) + '</div><div class="muted" style="font-size:11px">range ' + moneyC(rl.annual_lost.conservative) + ' – ' + moneyC(rl.annual_lost.aggressive) + '</div></div>' +
          '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:11px 14px"><div class="muted" style="font-size:11px">Gross at-risk / yr (base)</div><div style="font-size:22px;font-weight:700">' + moneyC(rl.gross_at_risk.base) + '</div><div class="muted" style="font-size:11px">sales flowing through failing xref searches</div></div>' +
          '<div class="muted" style="font-size:11px;max-width:380px">' + moneyC(rl.online_sales_annual) + '/yr online parts sales <b>(sourced: ' + escapeHtml(rl.online_sales_source) + ')</b> × ' + Math.round(rl.part_number_share * 100) + '% part-# search → ' + moneyC(rl.part_number_sales) + '/yr. Cross-ref fail rate <b>' + Math.round(rl.cross_ref_fail_rate * 100) + '% (measured, ' + escapeHtml(rl.fail_rate_measured) + ')</b>. ' + escapeHtml(rl.levers_note) + '</div></div>' +
          '<div class="table-wrap"><table><thead><tr><th>Competitor #</th><th>Brand</th><th>Cat equiv</th><th>Product</th><th>Monthly volume</th><th>Result</th></tr></thead><tbody>' +
          rl.top.map(function (t) { return '<tr><td><strong>' + escapeHtml(t.term) + '</strong></td><td>' + escapeHtml(t.brand) + '</td><td>' + escapeHtml(t.cat) + '</td><td>' + escapeHtml(t.product) + '</td><td>' + t.volume.toLocaleString('en-US') + '</td><td style="color:#b91c1c">0 results</td></tr>'; }).join('') +
          '</tbody></table></div><p class="muted" style="font-size:11px;margin-top:6px">Modeled estimate. <b>Measured:</b> 100% cross-reference failure + 100% Cat-number success on the top-25 by demand. Adjustable levers: part-# share of online sales, cross-ref share of part-# demand, recoverable fraction — tune to Caterpillar’s real figures.</p></div>');
      } else revenuePanel = (rl && rl.annual_lost) ? panel('Revenue at risk — and the opportunity at 1,000 terms', 'Modeled estimate — this bounded sample × real Keyword Planner volumes · a range, not audited revenue',
        '<div class="panel-body"><div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
        (rl.extrapolation ? '<div style="border:2px solid #cc0000;border-radius:8px;padding:11px 14px;background:#fff5f5"><div class="muted" style="font-size:11px">Projected across the top 1,000 search terms</div><div style="font-size:28px;font-weight:800;color:#cc0000">' + moneyC(rl.extrapolation.projected_annual.base) + '/yr</div><div class="muted" style="font-size:11px">range ' + moneyC(rl.extrapolation.projected_annual.conservative) + ' – ' + moneyC(rl.extrapolation.projected_annual.aggressive) + ' · ' + money(rl.extrapolation.per_term_avg_annual.base) + '/term × 1,000</div></div>' : '') +
        '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:11px 14px"><div class="muted" style="font-size:11px">Measured (base) — ' + rl.coverage.demand_terms + ' demand terms</div><div style="font-size:26px;font-weight:700;color:#cc0000">' + moneyC(rl.annual_lost.base) + '</div><div class="muted" style="font-size:11px">range ' + moneyC(rl.annual_lost.conservative) + ' – ' + moneyC(rl.annual_lost.aggressive) + '</div></div>' +
        '<div class="muted" style="font-size:11px;max-width:360px">Base assumptions: market share ' + (rl.base_scenario.market_share * 100).toFixed(1) + '%, search conversion ' + (rl.base_scenario.conversion_rate * 100).toFixed(1) + '%, AOV $' + rl.base_scenario.aov + '; a term grading ≥ ' + rl.accept_grade + '/3 counts as no loss. ' + rl.coverage.contributing_terms + ' of ' + rl.coverage.demand_terms + ' demand terms contribute.</div></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Term</th><th>Monthly volume</th><th>Grade</th><th>Annual $ lost (base)</th></tr></thead><tbody>' +
        rl.top.map(function (t) { return '<tr><td><strong>' + escapeHtml(t.term) + '</strong></td><td>' + t.volume.toLocaleString('en-US') + '</td><td>' + t.grade + '</td><td>' + money(t.annual_base) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="muted" style="font-size:11px;margin-top:6px">Modeled estimate for the sampled terms only — not audited revenue, not extrapolated to the full query catalog. Tune market share / conversion / AOV to the retailer’s real figures to tighten the range.</p></div>') : '';
      // Recall panel — answer-key coverage (present only when the catalog/recall pipeline has run).
      var keyedDs = (data.datasets || []).filter(function (d) { return d.mean_recall != null; });
      var worstRec = (data.rows || []).filter(function (r) { return r.recall != null; }).sort(function (a, b) { return a.recall - b.recall; }).slice(0, 8);
      var recallPanel = keyedDs.length ? panel('Recall — answer-key coverage', 'recall = |search ∩ catalog answer-key products| / answer-key · keyed datasets only · denominator from category nodes × facets (the number a grade cannot give)',
        '<div class="panel-body"><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        keyedDs.map(function (d) { var pct = Math.round(d.mean_recall * 100); return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px"><div class="muted" style="font-size:11px">' + escapeHtml(d.name) + ' recall</div><div style="font-size:22px;font-weight:700;color:' + (pct < 50 ? '#dc2626' : '#16a34a') + '">' + pct + '%</div><div class="muted" style="font-size:11px">' + (d.key_coverage_pct || 0) + '% of terms keyed</div></div>'; }).join('') +
        '</div>' + (worstRec.length ? '<div class="table-wrap"><table><thead><tr><th>Term</th><th>Recall</th><th>Answer key</th><th>Class</th></tr></thead><tbody>' + worstRec.map(function (r) { return '<tr><td><strong>' + escapeHtml(r.q) + '</strong></td><td><b style="color:' + (r.recall < 0.5 ? '#dc2626' : '#16a34a') + '">' + Math.round(r.recall * 100) + '%</b></td><td>' + (r.key_size || '') + ' products</td><td>' + escapeHtml((r.classification || '').replace(/_/g, ' ')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<p class="muted" style="font-size:11px;margin-top:6px">Denominator = distinct catalog PLP products (node × facet). Key confidence is low where facet provenance is unverified (L05). Recall reveals missed inventory the grade cannot — a term can grade well on eight results while the catalog holds forty.</p></div>') :
        panel('Recall — answer-key coverage', 'recall = |search ∩ catalog answer-key| / answer-key · the number a grade cannot give',
          '<div class="panel-body"><div class="muted" style="font-size:12px">Not measured for this site. Recall needs full catalog answer keys (category node × facet); this enterprise catalog (browser-eval, too large to page through exhaustively) was captured partially, so no full-coverage keys were built — see the catalog limitations. For this site the real signal is retrieval + relational (part-number / cross-reference), not recall.</div></div>');
      // Verification panel — independent-path re-check of the worst findings (L08).
      var vf = data.verification;
      var verificationPanel = (vf && vf.ran) ? panel('Independent verification', 'The worst findings re-checked through a DIFFERENT capture path than the one that produced them (L08) — re-grading the same capture ratifies, it does not test',
        '<div class="panel-body"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<div style="border:1px solid #16a34a;border-radius:8px;padding:8px 12px"><div class="muted" style="font-size:11px">Confirmed</div><div style="font-size:20px;font-weight:700;color:#16a34a">' + vf.confirmed + '</div></div>' +
        '<div style="border:1px solid #dc2626;border-radius:8px;padding:8px 12px"><div class="muted" style="font-size:11px">Refuted</div><div style="font-size:20px;font-weight:700;color:#dc2626">' + vf.refuted + '</div></div>' +
        (vf.inconclusive ? '<div style="border:1px solid #d97706;border-radius:8px;padding:8px 12px"><div class="muted" style="font-size:11px">Inconclusive</div><div style="font-size:20px;font-weight:700;color:#d97706">' + vf.inconclusive + '</div></div>' : '') +
        '<div class="muted" style="font-size:11px;max-width:360px">Original path <b>' + escapeHtml(vf.original_path || '') + '</b> → verified via <b>' + escapeHtml(vf.verification_path || '') + '</b>. ' + escapeHtml(vf.selection_rule || '') + '</div>' +
        '</div></div>') :
        panel('Independent verification', 'Worst findings re-checked through a DIFFERENT capture path (L08) — re-grading the same capture ratifies, it does not test',
          '<div class="panel-body"><div class="muted" style="font-size:12px">Not run yet — finding-verify (stage 6) is pending for this bounded browser-eval. The part-number-zero finding is already corroborated two ways on the same session (typeahead "no suggested results" for 1R-1808 + full-search zero), but has not been re-checked through a fully independent path.</div></div>');
      // Custom-dataset upload: paste a spec-conforming dataset, validate, preview, add to the board's manifest.
      var uploadPanel = panel('Custom dataset', 'Paste a dataset conforming to docs/custom-dataset-spec.md (synonym / hypernym / hyponym / 1-1). Validated here before it joins the board; demand travels inline.',
        '<div class="panel-body"><textarea id="cdPaste" placeholder="Paste custom dataset JSON…" style="width:100%;min-height:110px;font:inherit;font-size:12px;padding:6px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px"></textarea>' +
        '<div style="margin-top:6px"><button class="woo-replay" id="cdValidateBtn">Validate</button> <button class="woo-replay" id="cdSaveBtn" style="display:none">Add to board</button> <span id="cdOut" class="muted" style="font-size:12px;margin-left:8px"></span></div>' +
        '<div id="cdPreview" style="margin-top:8px"></div></div>');
      el.innerHTML =
        stageStripHtml +
        panel('Search relevance — ' + store.name, escapeHtml(store.platform || 'On-site search') + ' · graded 0–3 by a local LLM judge · click any dataset to expand its terms · ↗ opens the live ' + store.name + ' search',
          '<div class="panel-body">' + invalidBanner + (data.invalidated ? '' : pdfLink + copyLine + pasteLine) + head + combinedHead + groups + tableCaption + '</div>') +
        recallPanel + verificationPanel + findingsPanel + revenuePanel + uploadPanel;
      wireJumps(el);
      var copyBtnT = el.querySelector('#copyTermsBtnT');
      if (copyBtnT) copyBtnT.addEventListener('click', function () { var out = el.querySelector('#copyTermsOutT'); if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(kpLine).then(function () { out.textContent = 'Copied ' + kpTerms.length + ' terms'; }, function () { out.textContent = 'Copy failed'; }); } else { out.textContent = 'Clipboard not available'; } });
      var importBtnT = el.querySelector('#kpImportBtnT');
      if (importBtnT) importBtnT.addEventListener('click', async function () {
        var out = el.querySelector('#kpImportOutT'); var resDiv = el.querySelector('#kpResultT');
        var pasteEl = el.querySelector('#kpPasteT'); var paste = pasteEl ? pasteEl.value : '';
        if (!paste.trim()) { out.textContent = 'Paste the Keyword Planner output first.'; return; }
        out.textContent = 'Parsing and validating…'; resDiv.innerHTML = '';
        try {
          var r = await api('/api/demand/import?retailer=' + encodeURIComponent(retailer) + '&eval=' + encodeURIComponent(evalId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paste: paste }) });
          if (!r.ok) { out.textContent = r.error || 'Could not parse the paste.'; return; }
          out.innerHTML = 'Parsed <strong>' + r.parsed + '</strong> rows · matched <strong>' + r.matched + '</strong> of our terms' + (r.terms_without_data_count ? ' · ' + r.terms_without_data_count + ' had no volume' : '');
          if (r.top_opportunities && r.top_opportunities.length) {
            resDiv.innerHTML = '<div class="muted" style="font-size:11px;margin-bottom:3px">Top opportunities — highest demand where search underperforms (returns nothing or shallow results):</div><div class="table-wrap"><table><thead><tr><th>Term</th><th>Monthly volume</th><th>Issue</th></tr></thead><tbody>' + r.top_opportunities.map(function (o) { return '<tr><td><strong>' + escapeHtml(o.term) + '</strong></td><td>' + escapeHtml(String(o.volume_display)) + '</td><td>' + escapeHtml(o.issue) + '</td></tr>'; }).join('') + '</tbody></table></div>';
          } else { resDiv.innerHTML = '<div class="muted" style="font-size:12px;margin-top:4px">No high-demand failing terms in this batch.</div>'; }
        } catch (error) { out.textContent = 'Import failed: ' + error.message; }
      });
      // Custom-dataset upload: validate -> preview -> add to board manifest.
      var cdValidate = el.querySelector('#cdValidateBtn'), cdSave = el.querySelector('#cdSaveBtn');
      var cdParsed = null;
      var cdRenderPreview = function (v) {
        var out = el.querySelector('#cdOut'), prev = el.querySelector('#cdPreview'), save = el.querySelector('#cdSaveBtn');
        if (!v.ok) { out.innerHTML = '<span style="color:#b91c1c">✗ ' + escapeHtml((v.errors || []).join('; ') || 'invalid') + '</span>'; prev.innerHTML = ''; save.style.display = 'none'; return; }
        var p = v.preview;
        out.innerHTML = '<span style="color:#166534">✓ valid</span>';
        prev.innerHTML = '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">' +
          '<div style="font-size:13px"><strong>' + escapeHtml(p.name) + '</strong> <span style="font-size:9px;font-weight:700;border-radius:3px;padding:1px 5px;background:#ede9fe;color:#5b21b6">' + escapeHtml(p.label) + '</span> <span class="muted" style="font-size:11px">' + escapeHtml(p.type) + ' · ' + escapeHtml(p.scoring) + ' scoring</span></div>' +
          '<div class="muted" style="font-size:12px;margin:4px 0">' + escapeHtml(p.built_from) + '</div>' +
          '<div class="muted" style="font-size:11px">' + p.records + ' records · ' + p.with_demand + ' with demand · total monthly volume ' + (p.total_monthly_volume || 0).toLocaleString() + '</div>' +
          ((v.warnings && v.warnings.length) ? '<div style="font-size:11px;color:#92400e;margin-top:3px">⚠ ' + escapeHtml(v.warnings.join('; ')) + '</div>' : '') +
          '<div class="table-wrap" style="margin-top:6px"><table><thead><tr><th>Term</th><th>' + (p.type === 'one_to_one' ? 'Expected' : 'Counterpart') + '</th><th>Vol</th></tr></thead><tbody>' +
          (p.sample || []).map(function (s) { return '<tr><td>' + escapeHtml(s.term) + '</td><td>' + escapeHtml(s.expected ? (s.expected.sku + ' — ' + s.expected.title) : (s.counterpart || '')) + '</td><td>' + (s.monthly_volume || '') + '</td></tr>'; }).join('') +
          '</tbody></table></div></div>';
        save.style.display = '';
      };
      if (cdValidate) cdValidate.addEventListener('click', async function () {
        var out = el.querySelector('#cdOut'); var txt = (el.querySelector('#cdPaste') || {}).value || '';
        cdParsed = null; el.querySelector('#cdSaveBtn').style.display = 'none'; el.querySelector('#cdPreview').innerHTML = '';
        if (!txt.trim()) { out.textContent = 'Paste a dataset first.'; return; }
        var ds; try { ds = JSON.parse(txt); } catch (e) { out.innerHTML = '<span style="color:#b91c1c">Not valid JSON: ' + escapeHtml(e.message) + '</span>'; return; }
        out.textContent = 'validating…';
        try { var v = await api('/api/custom-dataset/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ds) }); if (v.ok) cdParsed = ds; cdRenderPreview(v); }
        catch (error) { out.textContent = 'Validate failed: ' + error.message; }
      });
      if (cdSave) cdSave.addEventListener('click', async function () {
        var out = el.querySelector('#cdOut'); if (!cdParsed) { out.textContent = 'Validate first.'; return; }
        out.textContent = 'saving…';
        try { var r = await api('/api/custom-dataset/save?retailer=' + encodeURIComponent(retailer) + '&eval=' + encodeURIComponent(evalId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cdParsed) }); if (!r.ok) { out.innerHTML = '<span style="color:#b91c1c">' + escapeHtml((r.errors || [r.error]).join('; ')) + '</span>'; return; } out.innerHTML = '<span style="color:#166534">✓ added ' + escapeHtml(r.file) + ' — capture + score to see it on the board</span>'; }
        catch (error) { out.textContent = 'Save failed: ' + error.message; }
      });
    }
    async function loadSearchScoreboard(targetId) {
      let data;
      try { data = await api('/api/search-datasets'); }
      catch (error) { document.getElementById('searchEval').innerHTML = ''; return; }
      if (state.selectedSite !== targetId) return;
      const el = document.getElementById('searchEval');
      if (!el || !data.captured || !data.datasets) { if (el) el.innerHTML = panel('Search datasets', '', '<div class="panel-body"><div class="empty">No datasets captured yet.</div></div>'); return; }
      const retailers = (data.retailers || []).map((id) => { for (const d of data.datasets) { if (d.retailers[id]) return { id, name: d.retailers[id].name }; } return { id, name: id }; });
      // Scoreboard: one row per dataset, a score cell per retailer.
      const scoreCell = (dsId, r, ds) => {
        const rr = ds.retailers[r.id]; if (!rr) return '<td class="muted">—</td>';
        const val = escapeHtml(String(rr.score)) + '% <span class="muted" style="font-size:11px">(' + escapeHtml(rr.score_label || '') + ')</span>';
        return '<td>' + (r.id === targetId
          ? jumpNum(val, 'ds-' + dsId, 'See ' + r.name + ' cases below')
          : '<a href="#" class="ds-site" data-target="' + escapeHtml(r.id) + '">' + val + '</a>') + '</td>';
      };
      const head = '<tr><th>Dataset</th>' + retailers.map((r) => '<th>' + escapeHtml(r.name) + '</th>').join('') + '</tr>';
      const body = data.datasets.map((ds) =>
        '<tr><td><strong>' + escapeHtml(ds.name) + '</strong><div class="muted" style="font-size:11px">' + escapeHtml(ds.scoring || '') + '</div></td>' +
        retailers.map((r) => scoreCell(ds.id, r, ds)).join('') + '</tr>').join('');
      const reportLink = '<div style="margin:0 0 9px;font-size:12px"><a class="relink" href="' + artifactHref('reports/homedepot-vs-lowes-search-discoveries.pdf') + '&t=' + Date.now() + '" target="_blank" rel="noopener" title="Home Depot vs Lowe&#39;s search relevance discoveries — PDF report">📄 Download the discoveries report (PDF)</a></div>';
      let html = panel('Search datasets — retailer scoreboard', 'Score per dataset per retailer · higher = better · click a score to drill · ● severity, grade 3 → 0',
        reportLink + '<div class="table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>');
      // This retailer's cases for each dataset (drill target).
      for (const ds of data.datasets) {
        const rr = ds.retailers[targetId];
        if (!rr) continue;
        // Relevance datasets (dimensions, pro): per-query NDCG, drill to per-product grades.
        if (ds.kind === 'relevance') {
          const rorder = { severe: 0, high: 1, medium: 2, minor: 3, pass: 4 };
          const rcases = (rr.cases || []).slice().sort((a, b) => ((rorder[a.verdict] ?? 2) - (rorder[b.verdict] ?? 2)) || ((a.ndcg ?? 1) - (b.ndcg ?? 1)));
          const gcol = (g) => g >= 3 ? '#16a34a' : g >= 2 ? '#65a30d' : g >= 1 ? '#d97706' : '#dc2626';
          const rrows = rcases.map((c) => {
            const nd = c.ndcg == null ? '—' : Math.round(c.ndcg * 100) + '%';
            const dot = '<span class="sdot sev-' + escapeHtml(c.verdict) + '" title="' + escapeHtml(c.verdict) + '"></span>';
            const chips = (c.count_ratio != null ? ' <span class="dvg" title="result-count ratio vs reference; band = expected">count ' + escapeHtml(String(c.count_ratio)) + '× [' + escapeHtml(String((c.band || [])[0])) + '–' + escapeHtml(String((c.band || [])[1])) + ']</span>' : '') +
              (c.jaccard != null ? ' <span class="dvg" title="top-N SKU overlap with reference (low = distinct result set)">overlap J=' + escapeHtml(String(c.jaccard)) + '</span>' : '') +
              (c.total != null ? ' <span class="qc">' + escapeHtml(String(c.total)) + ' results</span>' : '');
            const prod = (c.products || []).map((p, i) => '<div class="evrow"><span class="gbadge" style="background:' + gcol(p.grade) + '">' + escapeHtml(String(p.grade)) + '</span> ' + escapeHtml(p.t || ('#' + (i + 1))) + (p.reason ? ' <span class="muted" style="font-size:11px">— ' + escapeHtml(p.reason) + '</span>' : '') + '</div>').join('');
            return '<details class="exp"><summary>' + dot + ' <strong>' + escapeHtml(c.query) + '</strong> <b>' + nd + '</b> <span class="muted" style="font-size:11px">NDCG@' + escapeHtml(String(c.k || 10)) + '</span>' + chips + '</summary><div class="exp-body">' + prod + '</div></details>';
          }).join('');
          html += '<div id="ds-' + ds.id + '">' + panel(rr.name + ' — ' + ds.name, rr.score + '% (' + escapeHtml(rr.score_label || '') + ') · grade 3 perfect → 0 irrelevant; click a query for per-product grades',
            '<div class="panel-body">' + rrows + '</div>') + '</div>';
          continue;
        }
        const order = { severe: 0, high: 1, medium: 2, minor: 3, pass: 4 };
        const cases = (rr.cases || []).slice().sort((a, b) => ((order[a.verdict] ?? 2) - (order[b.verdict] ?? 2)) || (b.divergence_pct - a.divergence_pct));
        const rows = cases.map((p) => {
          const v = p.verify || {};
          const vok = v.status === 'confirmed';
          const vicon = '<span class="vchip ' + (vok ? 'vok" title="Reading re-checked against the live count — confirmed">✓' : 'vfail" title="Reading could not be confirmed">✗') + '</span>';
          const dot = '<span class="sdot sev-' + escapeHtml(p.verdict) + '" title="' + escapeHtml(p.verdict) + '"></span>';
          const summary = dot + ' <strong>' + escapeHtml(p.concept) + '</strong>' +
            ' <span class="qc">' + escapeHtml(p.term_a.q) + ' <b>' + escapeHtml(String(p.term_a.total)) + '</b></span>' +
            ' <span class="qc">' + escapeHtml(p.term_b.q) + ' <b>' + escapeHtml(String(p.term_b.total)) + '</b></span>' +
            ' <span class="dvg">Δ' + escapeHtml(String(p.divergence_pct)) + '%</span>' + vicon;
          const when = v.method === 'live re-check' ? ('by live re-check' + (v.at ? ' ' + escapeHtml(v.at) : '')) : 'read once at capture (not re-checked live)';
          const verdictLine = (vok ? '✓ Confirmed — ' + when : '✗ Not confirmed — could not read this count') + (v.detail ? ' · ' + escapeHtml(v.detail) : '');
          const live = (t) => t.url ? ' <a class="relink" href="' + escapeHtml(t.url) + '" target="_blank" rel="noopener" title="Open the live count on ' + escapeHtml(rr.name) + ' to re-verify yourself">↗ live</a>' : '';
          return '<details class="exp"><summary>' + summary + '</summary>' +
            '<div class="exp-body">' +
              '<div class="evrow"><code>' + escapeHtml(p.term_a.q) + '</code> → <b>' + escapeHtml(String(p.term_a.total)) + '</b> results' + live(p.term_a) + '</div>' +
              '<div class="evrow"><code>' + escapeHtml(p.term_b.q) + '</code> → <b>' + escapeHtml(String(p.term_b.total)) + '</b> results' + live(p.term_b) + '</div>' +
              (p.note ? '<div class="muted" style="font-size:11px;margin-top:4px">' + escapeHtml(p.note) + '</div>' : '') +
              '<div class="muted" style="font-size:11px;margin-top:5px">' + verdictLine + '</div>' +
            '</div></details>';
        }).join('');
        const nRead = cases.filter((c) => (c.verify || {}).status === 'confirmed').length;
        const nLive = cases.filter((c) => (c.verify || {}).method === 'live re-check').length;
        const nFail = cases.filter((c) => (c.verify || {}).status !== 'confirmed').length;
        const cc = ' · ✓ ' + nRead + ' readings valid' + (nLive ? ' (' + nLive + ' live-reverified)' : '') + (nFail ? ' · ✗ ' + nFail + ' unconfirmed' : '');
        html += '<div id="ds-' + ds.id + '">' + panel(rr.name + ' — ' + ds.name, rr.score + '% consistent (' + escapeHtml(rr.score_label || '') + ')' + cc,
          '<div class="panel-body">' + rows + '</div>') + '</div>';
      }
      el.innerHTML = html;
      wireJumps(el);
      for (const link of el.querySelectorAll('.ds-site')) {
        link.addEventListener('click', (event) => { event.preventDefault(); state.selected = null; selectSite(link.dataset.target); });
      }
    }
    async function loadSearchEval(targetId) {
      let data;
      try { data = await api('/api/search-eval?target=' + encodeURIComponent(targetId)); }
      catch (error) { document.getElementById('searchEval').innerHTML = ''; return; }
      if (state.selectedSite !== targetId) return;
      const el = document.getElementById('searchEval');
      if (!el) return;
      if (!data.captured || !data.pairs) {
        el.innerHTML = panel('Search evaluation', 'At a glance', '<div class="panel-body"><div class="empty">No browser search evaluation captured yet.</div></div>');
        return;
      }
      const s = data.pairs;
      const vc = s.verdict_counts || {};
      const sev = (v) => ({ severe: 'fail', high: 'fail', medium: 'warn', minor: 'muted-status', pass: 'pass' }[v] || 'warn');
      const order = { severe: 0, high: 1, medium: 2, minor: 3, pass: 4 };
      const pairs = (s.pairs || []).slice().sort((a, b) => (order[a.verdict] - order[b.verdict]) || (b.divergence_pct - a.divergence_pct));
      const metrics =
        healthMetric('Pairs tested', jumpNum(escapeHtml(String(s.total_pairs)), 'hd-pairs', 'See all pairs'), 'equivalent term pairs') +
        healthMetric('Problem pairs', jumpNum(escapeHtml(String(s.problem_pairs)), 'hd-pairs', 'Materially different results'), '>=40% divergence or wrong') +
        healthMetric('Severe', jumpNum(escapeHtml(String(vc.severe || 0)), 'hd-pairs'), '~90-99% collapse') +
        healthMetric('Map fine', jumpNum(escapeHtml(String(vc.pass || 0)), 'hd-pairs'), 'synonym works');
      const rows = pairs.map((p) => {
        const hi = p.term_a.total >= p.term_b.total ? p.term_a : p.term_b;
        const lo = p.term_a.total >= p.term_b.total ? p.term_b : p.term_a;
        return '<details class="exp"><summary>' + pill(sev(p.verdict), p.verdict) + ' <strong>' + escapeHtml(p.concept) + '</strong> — ' +
          escapeHtml(hi.q) + ' <strong>' + escapeHtml(String(hi.total)) + '</strong> vs ' + escapeHtml(lo.q) + ' <strong>' + escapeHtml(String(lo.total)) + '</strong> ' +
          '<span class="muted">(' + escapeHtml(String(p.divergence_pct)) + '% apart)</span></summary>' +
          '<div class="exp-body">' +
            '<div class="muted" style="font-size:12px;margin-bottom:6px">' + escapeHtml(p.note || '') + '</div>' +
            '<div><a href="' + escapeHtml(p.term_a.url) + '" target="_blank" rel="noopener">Open “' + escapeHtml(p.term_a.q) + '” search (' + escapeHtml(String(p.term_a.total)) + ')</a></div>' +
            '<div><a href="' + escapeHtml(p.term_b.url) + '" target="_blank" rel="noopener">Open “' + escapeHtml(p.term_b.q) + '” search (' + escapeHtml(String(p.term_b.total)) + ')</a></div>' +
          '</div></details>';
      }).join('');
      el.innerHTML =
        panel('Search evaluation', 'Category ↔ synonym mapping — captured ' + escapeHtml((s.captured_at || '').slice(0, 16).replace('T', ' ')),
          '<div class="panel-body"><div class="metric-row">' + metrics + '</div>' +
          (s.headline ? '<p class="muted" style="margin-top:10px;font-size:12px">' + escapeHtml(s.headline) + '</p>' : '') + '</div>') +
        '<div id="hd-pairs">' + panel('Equivalent-term pairs', 'The same product searched two ways — expand a pair to open each live search and verify the count',
          '<div class="panel-body">' + rows + '</div>') + '</div>';
      wireJumps(el);
    }
    function healthMetric(label, value, detail) {
      return '<article class="metric"><div class="metric-label">' + escapeHtml(label) + '</div><div class="metric-value">' + value + '</div><div class="metric-detail">' + escapeHtml(detail || '') + '</div></article>';
    }
    // Render a number as a navigation control: clicking it scrolls to and flashes
    // the backing items so any claimed count is self-verifiable (never a dead end).
    function jumpNum(display, targetId, hint) {
      return '<a href="#" class="jump" data-jump="' + escapeHtml(targetId) + '"' + (hint ? ' title="' + escapeHtml(hint) + '"' : '') + '>' + display + '</a>';
    }
    function wireJumps(root) {
      for (const link of root.querySelectorAll('.jump')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          const target = document.getElementById(link.dataset.jump);
          if (!target) return;
          const details = target.querySelector('details');
          if (details) details.open = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.remove('flash');
          void target.offsetWidth;
          target.classList.add('flash');
        });
      }
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

  if (request.method === 'GET' && url.pathname === '/api/woo/replay') {
    const targetId = url.searchParams.get('target');
    const targetPath = path.join(rootDir, 'targets', `${targetId}.json`);
    const replayUrl = url.searchParams.get('url') || '';
    if (!exists(targetPath)) { sendJson(response, 404, { error: 'Not a WooCommerce target.' }); return; }
    const target = readJson(targetPath);
    const adapter = wooAdapterForTarget(rootDir, targetId);
    if (!adapter) { sendJson(response, 404, { error: 'Not a WooCommerce target.' }); return; }
    // Only replay calls to THIS store's Store API (no arbitrary-URL fetching).
    let host = '';
    try { host = new URL(replayUrl).hostname.replace(/^www\./, ''); } catch { host = ''; }
    const okHost = host && host === String(target.domain || '').replace(/^www\./, '');
    const okPath = /\/wp-json\/wc\/store\//.test(replayUrl);
    if (!okHost || !okPath) { sendJson(response, 400, { error: 'Replay is restricted to this store\'s WooCommerce Store API.' }); return; }
    adapter.wooFetch(replayUrl)
      .then((res) => sendJson(response, 200, {
        url: replayUrl,
        status: res.status,
        ok: res.ok,
        result_count: res.total != null ? res.total : (Array.isArray(res.json) ? res.json.length : null),
        sample: Array.isArray(res.json) ? res.json.slice(0, 5).map((item) => item.name).filter(Boolean) : [],
        fetched_at: new Date().toISOString()
      }))
      .catch((error) => sendJson(response, 502, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/eval-board') {
    const evalId = url.searchParams.get('eval') || '';
    const retailer = url.searchParams.get('retailer') || 'industrywest';
    if (!/^SE-[0-9A-Za-z]+$/.test(evalId)) { sendJson(response, 400, { error: 'Invalid eval id.' }); return; }
    if (!/^[a-z0-9-]+$/.test(retailer)) { sendJson(response, 400, { error: 'Invalid retailer.' }); return; }
    // Industry West's board is eval-board.json; other retailers use <retailer>-eval-board.json.
    const dir = path.join(rootDir, 'assessments', retailer, 'search-eval', evalId);
    const boardPath = exists(path.join(dir, 'eval-board.json')) ? path.join(dir, 'eval-board.json') : path.join(dir, retailer + '-eval-board.json');
    if (!exists(boardPath)) { sendJson(response, 404, { error: 'No eval board for ' + retailer + '/' + evalId }); return; }
    sendJson(response, 200, { captured: true, ...readJson(boardPath) });
    return;
  }

  // 8-stage pipeline status for the stage strip — reuses pipeline-status.mjs --json.
  if (request.method === 'GET' && url.pathname === '/api/pipeline-status') {
    const evalId = url.searchParams.get('eval') || '';
    const retailer = url.searchParams.get('retailer') || '';
    if (!/^SE-[0-9A-Za-z]+$/.test(evalId) || !/^[a-z0-9-]+$/.test(retailer)) { sendJson(response, 400, { error: 'Invalid retailer/eval.' }); return; }
    const dir = path.join(rootDir, 'assessments', retailer, 'search-eval', evalId);
    if (!exists(dir)) { sendJson(response, 404, { error: 'No such assessment.' }); return; }
    try {
      const script = path.join(rootDir, 'framework/search-eval/scripts/pipeline-status.mjs');
      const out = execFileSync('node', [script, dir, '--json'], { encoding: 'utf8', timeout: 20000 });
      sendJson(response, 200, JSON.parse(out.trim().split('\n').filter(Boolean).pop()));
    } catch (error) { sendJson(response, 500, { error: 'pipeline-status failed: ' + error.message }); }
    return;
  }

  // Validate an uploaded custom dataset (portable contract) and return the preview the operator confirms.
  if (request.method === 'POST' && url.pathname === '/api/custom-dataset/validate') {
    readBody(request).then((body) => {
      const ds = body && body.dataset ? body.dataset : body;
      if (!ds || typeof ds !== 'object') { sendJson(response, 200, { ok: false, errors: ['not a JSON object'], warnings: [] }); return; }
      try { sendJson(response, 200, loadCustomDataset(ds)); }
      catch (error) { sendJson(response, 200, { ok: false, errors: ['validate error: ' + error.message], warnings: [] }); }
    }).catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  // Save a validated custom dataset into the assessment dir + register it in the manifest.
  if (request.method === 'POST' && url.pathname === '/api/custom-dataset/save') {
    const evalId = url.searchParams.get('eval') || '';
    const retailer = url.searchParams.get('retailer') || '';
    if (!/^SE-[0-9A-Za-z]+$/.test(evalId) || !/^[a-z0-9-]+$/.test(retailer)) { sendJson(response, 400, { error: 'Invalid retailer/eval.' }); return; }
    readBody(request).then((body) => {
      const ds = body && body.dataset ? body.dataset : body;
      const val = loadCustomDataset(ds || {});
      if (!val.ok) { sendJson(response, 200, { ok: false, errors: val.errors }); return; }
      if (!/^[a-z0-9-]+$/.test(ds.dataset_id || '')) { sendJson(response, 400, { error: 'dataset_id must match [a-z0-9-]+' }); return; }
      const dir = path.join(rootDir, 'assessments', retailer, 'search-eval', evalId);
      if (!exists(dir)) { sendJson(response, 404, { error: 'No such assessment.' }); return; }
      const fname = 'custom-' + ds.dataset_id + '.json';
      fs.writeFileSync(path.join(dir, fname), JSON.stringify(ds, null, 1));
      const manPath = path.join(dir, 'dataset-manifest.json');
      const man = exists(manPath) ? readJson(manPath) : { manifest_version: '1', retailer, eval_id: evalId, datasets: [] };
      man.datasets = (man.datasets || []).filter((d) => d.id !== ds.dataset_id);
      man.datasets.push({ id: ds.dataset_id, kind: 'custom', include: true, type: ds.type, scoring: val.preview.scoring, file: fname });
      fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
      sendJson(response, 200, { ok: true, file: fname, preview: val.preview, datasets: man.datasets.length });
    }).catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/eval/rerun-ndcg') {
    const evalId = url.searchParams.get('eval') || '';
    const store = url.searchParams.get('store') || '';
    const q = url.searchParams.get('q') || '';
    if (!/^SE-[0-9A-Za-z]+$/.test(evalId)) { sendJson(response, 400, { error: 'Invalid eval id.' }); return; }
    const boardPath = path.join(rootDir, 'assessments', 'industrywest', 'search-eval', evalId, 'eval-board.json');
    if (!exists(boardPath)) { sendJson(response, 404, { error: 'No eval board.' }); return; }
    const board = readJson(boardPath);
    const row = (board.rows || []).find((r) => r.store === store && r.q === q);
    if (!row) { sendJson(response, 404, { error: 'No such query row.' }); return; }
    if (!row.items || !row.items.length) { sendJson(response, 200, { rerun: false, reason: 'zero-result query (nothing to grade)' }); return; }
    const CORTEX = 'http://127.0.0.1:7077';
    const rid = store === 'IW' ? 'industrywest' : 'sevenbonde';
    const products = row.items.map((t, i) => ({ id: rid + '|' + q + '#' + (i + 1), title: t }));
    (async () => {
      try {
        const sub = await fetch(CORTEX + '/v1/relevance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'eval-board-rerun', k: 10, queries: [{ query_id: rid + '|' + q, query: q, products }] }) }).then((r) => r.json());
        let res;
        for (let i = 0; i < 40; i++) { res = await fetch(CORTEX + '/v1/relevance/' + sub.job_id).then((r) => r.json()); if (res.status === 'complete') break; await new Promise((r) => setTimeout(r, 1500)); }
        if (!res || res.status !== 'complete') { sendJson(response, 200, { rerun: false, reason: 'Cortex did not complete in time' }); return; }
        const jr = res.queries[0];
        const grades = (jr.judgments || []).map((j) => j.grade);
        const storedGrades = (row.grades_pinned && row.grades_pinned.length) ? row.grades_pinned : row.grades;
        sendJson(response, 200, { rerun: true, ndcg: jr.metrics && jr.metrics.ndcg, grades, rubric_hash: res.rubric_hash, stored_ndcg: row.ndcg_pinned != null ? row.ndcg_pinned : row.ndcg, stored_grades: storedGrades, matches: JSON.stringify(grades) === JSON.stringify(storedGrades) });
      } catch (error) { sendJson(response, 502, { error: 'Cortex unreachable: ' + error.message }); }
    })();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/demand/import') {
    const evalId = url.searchParams.get('eval') || 'SE-20260713';
    const retailer = url.searchParams.get('retailer') || 'industrywest';
    if (!/^SE-[0-9A-Za-z]+$/.test(evalId) || !/^[a-z0-9-]+$/.test(retailer)) { sendJson(response, 400, { error: 'Invalid retailer/eval.' }); return; }
    readBody(request).then((body) => {
      const { rows, skipped } = parseKeywordPlanner((body && body.paste) || '');
      if (!rows.length) { sendJson(response, 200, { ok: false, parsed: 0, error: 'No Keyword Planner rows recognized. Paste the table with keyword + avg. monthly searches.' }); return; }
      const dir = path.join(rootDir, 'assessments', retailer, 'search-eval', evalId);
      const boardPath = exists(path.join(dir, 'eval-board.json')) ? path.join(dir, 'eval-board.json') : path.join(dir, retailer + '-eval-board.json');
      const board = exists(boardPath) ? readJson(boardPath) : { rows: [] };
      // Per-term signal: worst result count across stores, and mean grade (works for both board shapes).
      const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      const info = {};
      for (const r of (board.rows || [])) {
        const it = info[r.q] || (info[r.q] = { minTotal: Infinity, grades: [] });
        const tot = typeof r.total === 'number' ? r.total : (String(r.total).indexOf('0') === 0 && String(r.total).length === 1 ? 0 : 1);
        it.minTotal = Math.min(it.minTotal, tot);
        if (r.grades_pinned && r.grades_pinned.length) it.grades = it.grades.concat(r.grades_pinned);
        if (r.mean_grade != null) it.mg = r.mean_grade;
      }
      const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
      const ourNorm = new Map(Object.keys(info).map((t) => [norm(t), t]));
      const matched = []; const unmatchedKp = [];
      for (const row of rows) {
        const t = ourNorm.get(norm(row.keyword));
        if (t) matched.push({ term: t, volume: parseVolume(row.avg_monthly_searches), raw: row.avg_monthly_searches });
        else unmatchedKp.push(row.keyword);
      }
      const matchedSet = new Set(matched.map((m) => m.term));
      const termsNoData = Object.keys(info).filter((t) => !matchedSet.has(t));
      // A term is a priority if it returns nothing (recall bug) OR its results are shallow (mean grade < 1.5).
      const gradeOf = (t) => { const i = info[t]; return i ? (i.mg != null ? i.mg : (i.grades.length ? +mean(i.grades).toFixed(2) : null)) : null; };
      const signalOf = (t) => {
        const i = info[t]; if (!i) return null;
        if (i.minTotal === 0) return { kind: 'zero-result', label: 'returns nothing' };
        const g = gradeOf(t);
        if (g != null && g < 1.5) return { kind: 'shallow', label: 'shallow (grade ' + g + ')' };
        return null;
      };
      const opps = matched.map((m) => ({ ...m, sig: signalOf(m.term), grade: gradeOf(m.term) }))
        .filter((m) => m.volume != null && m.sig).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 20)
        .map((m) => ({ term: m.term, volume: m.volume, volume_display: m.raw, issue: m.sig.label, grade: m.grade }));
      writeText(path.join(dir, 'demand-volume.json'),
        JSON.stringify({ imported_at: new Date().toISOString(), retailer, eval: evalId, parsed_rows: rows.length, matched: matched.map((m) => ({ term: m.term, volume: m.volume, raw: m.raw })) }, null, 1));
      sendJson(response, 200, { ok: true, parsed: rows.length, skipped: skipped.length, matched: matched.length, unmatched_kp_count: unmatchedKp.length, unmatched_kp: unmatchedKp.slice(0, 40), terms_without_data_count: termsNoData.length, terms_without_data: termsNoData, top_opportunities: opps });
    }).catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/search-eval') {
    const data = latestSearchEval(rootDir, url.searchParams.get('target'));
    sendJson(response, 200, data ? { captured: true, ...data } : { captured: false });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/search-datasets') {
    const data = latestSearchDatasets(rootDir);
    sendJson(response, 200, data ? { captured: true, ...data } : { captured: false });
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
