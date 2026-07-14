#!/usr/bin/env node

import path from 'node:path';
import { exists, latestDirectory, readJson } from '../lib/fs-json.mjs';
import { createDashboardServer } from './dashboard-server.mjs';

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  assert(response.ok, `${url} returned ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function fetchText(url) {
  const response = await fetch(url);
  const text = await response.text();
  assert(response.ok, `${url} returned ${response.status}: ${text.slice(0, 200)}`);
  return text;
}

async function main() {
  const runDir = process.argv[2] || latestDirectory('assessments/ridge/inspection-report/GEN-013');
  assert(runDir, 'No inspection run directory found for dashboard validation.');
  assert(exists(path.join(runDir, 'dashboard.html')), `Missing static dashboard export: ${path.join(runDir, 'dashboard.html')}`);

  const staticHtml = exists(path.join(runDir, 'dashboard.html')) ? await fetchText(`file://${path.resolve(runDir, 'dashboard.html')}`).catch(() => '') : '';
  if (staticHtml) {
    assert(staticHtml.includes('Inspection Dashboard'), 'Static dashboard HTML missing Inspection Dashboard heading.');
    assert(staticHtml.includes('Report Readiness'), 'Static dashboard HTML missing Report Readiness section.');
    assert(staticHtml.includes('Artifact Explorer'), 'Static dashboard HTML missing Artifact Explorer section.');
  } else {
    const html = await import('node:fs').then((fs) => fs.readFileSync(path.join(runDir, 'dashboard.html'), 'utf8'));
    assert(html.includes('Inspection Dashboard'), 'Static dashboard HTML missing Inspection Dashboard heading.');
    assert(html.includes('Report Readiness'), 'Static dashboard HTML missing Report Readiness section.');
    assert(html.includes('Artifact Explorer'), 'Static dashboard HTML missing Artifact Explorer section.');
  }

  const dashboard = await createDashboardServer({ port: 0, host: '127.0.0.1', rootDir: process.cwd() });
  try {
    const health = await fetchJson(`${dashboard.url}/api/health`);
    assert(health.status === 'ok', 'Dashboard health route did not return ok.');

    const page = await fetchText(`${dashboard.url}/`);
    assert(page.includes('Operational Dashboard'), 'Dashboard page missing operational title.');
    assert(page.includes('Run, review, debug, compare'), 'Dashboard page missing mission-aligned purpose copy.');
    assert(page.includes('id="runBtn"'), 'Dashboard page missing Run control.');
    assert(page.includes('id="resumeBtn"'), 'Dashboard page missing Resume control.');
    assert(page.includes('id="rerunBtn"'), 'Dashboard page missing Rerun control.');
    assert(page.includes("'/api/' + kind"), 'Dashboard page missing action API wiring.');

    const inspections = await fetchJson(`${dashboard.url}/api/inspections`);
    assert(Array.isArray(inspections) && inspections.length > 0, 'Dashboard inspections API returned no history rows.');
    const ridge = inspections.find((row) => row.target_id === 'ridge');
    assert(ridge, 'Dashboard history does not include Ridge.');

    const detail = await fetchJson(`${dashboard.url}/api/inspection/${encodeURIComponent(ridge.inspection_id)}`);
    assert(detail.report?.target?.target_id === 'ridge', 'Ridge inspection detail did not load.');
    assert(detail.dashboard?.operational_summary, 'Ridge dashboard detail missing operational summary.');
    assert(Array.isArray(detail.timeline), 'Ridge inspection detail missing timeline array.');
    assert(detail.plugin_state?.plugins, 'Ridge inspection detail missing plugin state.');
    assert(detail.artifact_index?.groups, 'Ridge inspection detail missing artifact index.');

    const report = readJson(path.join(runDir, 'inspection-report.json'));
    assert(report.dashboard?.operational_summary?.downstream_report_readiness === 'not_ready', 'Ridge readiness should remain not_ready for the current partial inspection.');

    const artifact = await fetchText(
      `${dashboard.url}/artifact?path=${encodeURIComponent(path.join(runDir, 'inspection-report.md'))}`
    );
    assert(artifact.includes('Inspection Report: Ridge'), 'Artifact route did not serve Ridge report markdown.');

    assert(page.includes('id="tabDatasets"'), 'Dashboard page missing Datasets tab.');
    assert(page.includes('id="datasetNav"'), 'Dashboard page missing dataset navigator.');
    assert(page.includes('id="datasetView"'), 'Dashboard page missing dataset viewer container.');
    assert(page.includes("'/api/dataset?path='"), 'Dashboard page missing dataset API wiring.');

    const catalog = await fetchJson(`${dashboard.url}/api/datasets`);
    const groupIds = (catalog.groups || []).map((group) => group.id);
    for (const expected of ['evaluations', 'targets', 'query-packs', 'site-profiles', 'platform', 'inspection-history', 'run-datasets']) {
      assert(groupIds.includes(expected), `Dataset catalog missing group: ${expected}`);
    }
    const targetsGroup = catalog.groups.find((group) => group.id === 'targets');
    assert(targetsGroup?.files?.some((file) => file.path === 'targets/ridge.json'), 'Dataset catalog missing targets/ridge.json.');
    const runGroup = catalog.groups.find((group) => group.id === 'run-datasets');
    assert(runGroup?.files?.length > 0, 'Dataset catalog has no generated run datasets.');
    assert(runGroup.files.every((file) => file.inspection_id), 'Run dataset files missing inspection_id linkage.');

    const targetDataset = await fetchJson(`${dashboard.url}/api/dataset?path=${encodeURIComponent('targets/ridge.json')}`);
    assert(targetDataset.record_count >= 1, 'targets/ridge.json dataset returned no records.');
    assert(Array.isArray(targetDataset.fields) && targetDataset.fields.includes('target_id'), 'targets/ridge.json dataset missing target_id field.');

    const historyDataset = await fetchJson(`${dashboard.url}/api/dataset?path=${encodeURIComponent('inspection-history/GEN-013.jsonl')}`);
    assert(historyDataset.format === 'jsonl', 'Inspection history dataset should parse as jsonl.');
    assert(historyDataset.record_count > 0, 'Inspection history dataset returned no records.');
    assert(historyDataset.fields.includes('inspection_id'), 'Inspection history dataset missing inspection_id field.');

    const registryDataset = await fetchJson(`${dashboard.url}/api/dataset?path=${encodeURIComponent('platform/capability-registry.json')}`);
    assert(registryDataset.meta?.record_field === 'capabilities', 'Capability registry dataset should surface the capabilities array as records.');
    assert(registryDataset.records.some((record) => record.capability_id === 'P001'), 'Capability registry dataset missing P001 record.');

    const runDatasetFile = runGroup.files.find((file) => file.format === 'jsonl');
    if (runDatasetFile) {
      const runDataset = await fetchJson(`${dashboard.url}/api/dataset?path=${encodeURIComponent(runDatasetFile.path)}`);
      assert(runDataset.record_count > 0, `Run dataset ${runDatasetFile.path} returned no records.`);
    }

    const traversal = await fetch(`${dashboard.url}/api/dataset?path=${encodeURIComponent('../outside.json')}`);
    assert(traversal.status === 400, 'Dataset route did not reject path traversal.');
    const badExtension = await fetch(`${dashboard.url}/api/dataset?path=${encodeURIComponent('MISSION.md')}`);
    assert(badExtension.status === 400, 'Dataset route did not reject non-JSON files.');
  } finally {
    await new Promise((resolve) => dashboard.server.close(resolve));
  }

  if (failures.length > 0) {
    console.error(`Dashboard validation failed with ${failures.length} issue(s):`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Dashboard validation passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
