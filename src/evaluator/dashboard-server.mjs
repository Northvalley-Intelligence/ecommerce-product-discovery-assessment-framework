#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, listFilesRecursive, readJson, readJsonl, writeText } from '../lib/fs-json.mjs';
import { previewCleanup, runCleanup } from './cleanup.mjs';
import { loadInspectionConfig, saveInspectionConfig } from './inspection-config.mjs';
import { curateQueryPack } from './curate-query-pack.mjs';
import { generateFixPlan, readFixPlan, verifyFixPlan } from './fix-plan.mjs';
import { generateExecutiveReport } from './generate-executive-report.mjs';
import { onboardTarget } from './onboard-target.mjs';
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
    .flatMap((file) => readJsonl(file));
  return rows.sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
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
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 14px;
    }
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
        <button id="tabInspections" class="tab active" role="tab">Inspections</button>
        <button id="tabDatasets" class="tab" role="tab">Datasets</button>
      </div>
      <div class="run-list" id="runList"></div>
      <div class="dataset-nav" id="datasetNav" hidden></div>
      <div class="storage" id="storagePanel">
        <h3>Storage</h3>
        <p class="muted" id="storageSummary">Loading…</p>
        <div class="storage-actions">
          <select id="cleanupPolicy">
            <option value="keep-latest-1">Keep latest run per site</option>
            <option value="keep-latest-3">Keep latest 3 runs per site</option>
            <option value="all-runs">Delete all inspection runs</option>
          </select>
          <button id="cleanupPreviewBtn" class="secondary">Preview cleanup</button>
        </div>
        <div id="cleanupResult" class="muted"></div>
      </div>
    </aside>
    <main>
      <div id="inspectionView">
        <section class="page-actions">
          <button id="newInspectionBtn">+ New Inspection</button>
          <span class="muted">Add a Shopify store, or select an inspection to review, rerun, or edit its setup.</span>
        </section>
        <div id="actionResult" class="muted"></div>
        <div id="detail"></div>
      </div>
      <div id="datasetView" hidden></div>
      <div id="setupView" hidden></div>
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
      detailTab: 'overview'
    };

    function cls(status) {
      const value = String(status || '').toLowerCase();
      if (['pass', 'complete', 'completed', 'ready', 'bounded', 'verified_fixed'].includes(value)) return 'pass';
      if (['warn', 'partial', 'limited', 'open'].includes(value)) return 'warn';
      if (['fail', 'failed', 'blocked', 'not_ready', 'still_failing', 'regressed'].includes(value)) return 'fail';
      return 'muted-status';
    }
    function pill(status) {
      return '<span class="status ' + cls(status) + '">' + escapeHtml(String(status || 'unknown').toUpperCase()) + '</span>';
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[char]);
    }
    function artifactHref(file) {
      return '/artifact?path=' + encodeURIComponent(file);
    }
    function datasetHash(file, query) {
      return '#dataset=' + encodeURIComponent(file) + (query ? '&q=' + encodeURIComponent(query) : '');
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
        return { view: 'datasets', path: params.get('dataset'), q: params.get('q') || '' };
      }
      if (hash.startsWith('datasets')) return { view: 'datasets', path: null, q: '' };
      if (params.has('setup')) return { view: 'setup', target: params.get('setup') || null };
      if (hash === 'setup') return { view: 'setup', target: null };
      return { view: 'inspections', path: null, q: '' };
    }
    async function api(path, options) {
      const response = await fetch(path, options);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    }
    async function refresh() {
      state.inspections = await api('/api/inspections');
      if (!state.selected && state.inspections.length) state.selected = state.inspections[0].inspection_id;
      renderRuns();
      updateStorageSummary();
      if (state.selected) await loadInspection(state.selected);
    }
    async function updateStorageSummary() {
      try {
        const storage = await api('/api/storage');
        document.getElementById('storageSummary').textContent = storage.total_runs + ' inspection run' + (storage.total_runs === 1 ? '' : 's') + ' stored on disk.';
      } catch (error) {
        document.getElementById('storageSummary').textContent = 'Storage info unavailable.';
      }
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
      const ok = window.confirm('Delete ' + preview.runs_to_remove + ' inspection run(s) and free ' + preview.freed_mb + ' MB? This keeps ' + preview.runs_kept + ' run(s) (including any referenced by a fix plan) and cannot be undone. Manifests, query packs, and fix plans are not touched.');
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
    function renderRuns() {
      const list = document.getElementById('runList');
      list.innerHTML = state.inspections.map((run) => {
        return '<button class="run-item ' + (run.inspection_id === state.selected ? 'active' : '') + '" data-id="' + escapeHtml(run.inspection_id) + '">' +
          '<span class="run-top"><span class="run-title">' + escapeHtml(run.target_name) + '</span>' + pill(run.status) + '</span>' +
          '<span class="muted">' + escapeHtml(run.inspection_id) + '</span>' +
          '<span class="muted">' + escapeHtml(run.timestamp) + '</span>' +
          '<span class="muted">Readiness: ' + escapeHtml(run.readiness) + ' | Coverage: ' + escapeHtml(run.evidence_coverage) + '%</span>' +
        '</button>';
      }).join('') || '<div class="empty">No inspection history found.</div>';
      for (const button of list.querySelectorAll('button[data-id]')) {
        button.addEventListener('click', async () => {
          state.selected = button.dataset.id;
          renderRuns();
          await loadInspection(state.selected);
        });
      }
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
      for (const plugin of report.plugin_results || []) {
        if (!['blocked', 'fail', 'warn'].includes(plugin.status)) continue;
        const limits = (plugin.infrastructure_limitations || []).map((limit) =>
          (limit.query_id ? limit.query_id + ': ' : '') + (limit.label || limit.code || 'issue') +
          (typeof limit.status === 'number' ? ' (HTTP ' + limit.status + ')' : '') +
          (limit.endpoint ? ' — ' + limit.endpoint : ''));
        items.push({
          severity: plugin.status === 'warn' ? 'warn' : 'fail',
          tab: 'health',
          headline: '<strong>' + escapeHtml(plugin.plugin_id) + '</strong> ' + (plugin.status === 'warn' ? 'completed with warnings' : 'was ' + escapeHtml(plugin.status)),
          detail: limits.length ? limits : ['No per-request classification recorded; open the evidence to inspect ' + plugin.observations + ' observation(s).'],
          evidence_file: plugin.evidence_file || null
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
        item.detail.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul></details>';
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
      const lanes = order.map((id) => {
        const lane = plugins[id];
        const cells = lane.obs.map((observation) => {
          const label = (observation.query_id || '') + ' → HTTP ' + (observation.status ?? 'n/a');
          return '<span class="tl-cell ' + httpClass(observation.status) + '" title="' + escapeHtml(label) + '"></span>';
        }).join('');
        const errors = lane.obs.filter((observation) => typeof observation.status === 'number' && observation.status >= 400).length;
        const meta = lane.obs.length + ' request' + (lane.obs.length === 1 ? '' : 's') + (errors ? ' · ' + errors + ' error' + (errors === 1 ? '' : 's') : '');
        return '<div class="tl-lane"><div class="tl-lane-head"><strong>' + escapeHtml(id) + '</strong>' + pill(lane.status || 'not_run') + '</div><div class="tl-cells">' + (cells || '<span class="muted">no requests recorded</span>') + '</div><div class="muted" style="font-size:12px">' + escapeHtml(meta) + '</div></div>';
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

      const heroSection = '<section class="hero"><div><p class="eyebrow">Selected Inspection</p><h1>' + escapeHtml(summary.target_name || report.target?.name || 'Inspection') + '</h1><div class="subline"><span>' + escapeHtml(report.inspection_id || '') + '</span><span>' + escapeHtml(summary.target_url || '') + '</span><span>' + escapeHtml(report.generated_at || '') + '</span></div><div class="hero-actions"><button id="detailRerunBtn">Rerun ' + escapeHtml(summary.target_name || report.target?.name || 'this inspection') + '</button><button id="detailResumeBtn" class="secondary">Resume</button><button id="detailEditBtn" class="secondary" data-target="' + escapeHtml(report.target?.target_id || '') + '">Edit setup</button></div></div><div style="text-align:right">' + statusPill + '<div class="muted" style="margin-top:8px">Readiness: ' + escapeHtml(op.downstream_report_readiness || 'unknown') + '</div></div></section>';

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
        panel('Fix Plan', 'Findings become verifiable fixes', '<div class="panel-body readiness"><div>' +
          (data.fix_plan
            ? '<p class="muted" style="margin:0">' + data.fix_plan.open_items + ' open · ' + data.fix_plan.verified_items + ' verified fixed' + (data.fix_plan.last_verification_inspection ? ' · last verified against ' + escapeHtml(data.fix_plan.last_verification_inspection) : '') + ' · <a href="' + datasetHash(data.fix_plan.path) + '">Explore plan</a></p>'
            : '<p class="muted" style="margin:0">No fix plan yet for this target. Generate one from an executive report with issues.</p>') +
          '</div><div class="readiness-stats"><button id="fixPlanBtn" class="secondary" data-run="' + escapeHtml(data.run_dir) + '">' + (data.fix_plan ? 'Update Fix Plan' : 'Generate Fix Plan') + '</button>' + (data.fix_plan ? '<button id="verifyFixesBtn" class="secondary" data-run="' + escapeHtml(data.run_dir) + '">Verify Against This Run</button><button id="verifyLiveBtn" data-target="' + escapeHtml(data.fix_plan.target_id) + '">Run Verification Inspection</button>' : '') + '</div></div>' +
          (data.fix_plan && data.fix_plan.items.length
            ? table(['Status', 'Severity', 'Surface', 'Query', 'Recommended Fix'], data.fix_plan.items, (item) => ['<td>' + pill(item.status) + '</td>', '<td>' + escapeHtml(item.severity) + '</td>', '<td>' + escapeHtml(item.surface) + '</td>', '<td><span class="mono">' + escapeHtml(item.query) + '</span></td>', '<td>' + escapeHtml(item.recommendation) + '</td>'])
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
      document.getElementById('tabInspections').classList.toggle('active', view === 'inspections' || view === 'setup');
      document.getElementById('tabDatasets').classList.toggle('active', view === 'datasets');
      document.getElementById('runList').hidden = view === 'datasets';
      document.getElementById('datasetNav').hidden = view !== 'datasets';
      document.getElementById('inspectionView').hidden = view !== 'inspections';
      document.getElementById('datasetView').hidden = view !== 'datasets';
      document.getElementById('setupView').hidden = view !== 'setup';
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
    async function loadCatalog() {
      state.catalog = await api('/api/datasets');
      renderDatasetNav();
    }
    function renderDatasetNav() {
      const nav = document.getElementById('datasetNav');
      if (!state.catalog) {
        nav.innerHTML = '<div class="empty">Loading datasets...</div>';
        return;
      }
      nav.innerHTML = state.catalog.groups.map((group) => {
        const files = group.files || [];
        return '<div class="dataset-group"><h3>' + escapeHtml(group.label) + '</h3><div class="dataset-files">' +
          (files.length ? files.map((file) =>
            '<button class="dataset-file' + (file.path === state.datasetPath ? ' active' : '') + '" data-path="' + escapeHtml(file.path) + '">' +
              '<span class="file-name">' + escapeHtml(file.inspection_id ? (file.target_name || 'Run') + ' · ' + file.name : file.name) + '</span>' +
              (file.inspection_id ? '<small>' + escapeHtml(file.inspection_id) + '</small>' : '') +
              '<small>' + escapeHtml(file.format.toUpperCase() + ' · ' + formatBytes(file.size_bytes)) + '</small>' +
            '</button>').join('') : '<div class="empty">No files.</div>') +
        '</div></div>';
      }).join('');
      for (const button of nav.querySelectorAll('button[data-path]')) {
        button.addEventListener('click', () => {
          window.location.hash = datasetHash(button.dataset.path);
        });
      }
    }
    async function openDataset(file, query) {
      const samePath = state.datasetPath === file && state.dataset;
      state.datasetQuery = query || '';
      state.selectedRecordIndex = -1;
      if (!samePath) {
        state.datasetPath = file;
        state.datasetField = '';
        state.dataset = null;
        state.datasetError = null;
        window.scrollTo(0, 0);
        renderDatasetNav();
        renderDatasetView();
        try {
          state.dataset = await api('/api/dataset?path=' + encodeURIComponent(file));
        } catch (error) {
          state.datasetError = error.message;
        }
        renderDatasetNav();
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
      view.innerHTML =
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
      setView(route.view);
      if (route.view !== 'datasets') return;
      if (!state.catalog) loadCatalog().catch((error) => {
        document.getElementById('datasetNav').innerHTML = '<div class="empty">Dataset catalog failed to load: ' + escapeHtml(error.message) + '</div>';
      });
      if (route.path) {
        await openDataset(route.path, route.q);
      } else {
        renderDatasetNav();
        renderDatasetView();
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
    document.getElementById('cleanupPreviewBtn').addEventListener('click', () => cleanupFlow().catch((error) => alert(error.message)));
    document.getElementById('newInspectionBtn').addEventListener('click', () => { window.location.hash = '#setup'; });
    document.getElementById('tabInspections').addEventListener('click', () => { window.location.hash = '#inspections'; });
    document.getElementById('tabDatasets').addEventListener('click', () => { window.location.hash = '#datasets'; });
    window.addEventListener('hashchange', () => applyHash().catch((error) => {
      document.getElementById('datasetView').innerHTML = '<div class="panel"><div class="panel-body">Dataset view failed to load: ' + escapeHtml(error.message) + '</div></div>';
    }));
    refresh().catch((error) => {
      document.getElementById('detail').innerHTML = '<div class="panel"><div class="panel-body">Dashboard failed to load: ' + escapeHtml(error.message) + '</div></div>';
    });
    applyHash().catch((error) => {
      document.getElementById('datasetView').innerHTML = '<div class="panel"><div class="panel-body">Dataset view failed to load: ' + escapeHtml(error.message) + '</div></div>';
    });
  </script>
</body>
</html>`;
}

function parseCleanupPolicy(raw) {
  if (raw === 'all-runs') return { policy: 'all-runs' };
  const match = String(raw || 'keep-latest-1').match(/^keep-latest-(\d+)$/);
  return { policy: 'keep-latest', keep: match ? Number(match[1]) : 1 };
}

function routeRequest(rootDir, request, response) {
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
          const run = runChild(rootDir, ['src/evaluator/run-inspection.mjs', '--evaluation', saved.evaluation], `setup-run-${Date.now()}.log`);
          sendJson(response, 202, { ...saved, ...run, running: true });
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
        const result = runChild(
          rootDir,
          ['src/evaluator/verify-fixes-live.mjs', body.target_id],
          `verify-live-${Date.now()}.log`
        );
        sendJson(response, 202, result);
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
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
        const args = ['src/evaluator/run-inspection.mjs', '--evaluation', body.evaluation || 'evaluations/ridge-shopify-baseline.json'];
        if (body.only) args.push('--only', body.only);
        const result = runChild(rootDir, args, `run-${Date.now()}.log`);
        sendJson(response, 202, result);
      })
      .catch((error) => sendJson(response, 400, { error: error.message }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/resume') {
    readBody(request)
      .then((body) => {
        if (!body.run_dir) throw new Error('run_dir is required.');
        safeResolve(rootDir, body.run_dir);
        const result = runChild(rootDir, ['src/evaluator/run-inspection.mjs', '--resume', body.run_dir], `resume-${Date.now()}.log`);
        sendJson(response, 202, result);
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
        const result = runChild(rootDir, ['src/evaluator/run-inspection.mjs', '--evaluation', evaluation], `rerun-${Date.now()}.log`);
        sendJson(response, 202, result);
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
  const server = http.createServer((request, response) => {
    try {
      routeRequest(rootDir, request, response);
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
