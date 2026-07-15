#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exists, latestDirectory, readJson } from '../lib/fs-json.mjs';
import { createDashboardServer } from './dashboard-server.mjs';

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
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

    assert(page.includes('id="addSiteBtn"'), 'Dashboard page missing Add Site control.');
    assert(page.includes("'/api/onboard'"), 'Dashboard page missing onboarding API wiring.');
    assert(page.includes("'/api/executive-report'"), 'Dashboard page missing executive report API wiring.');

    const dressUpRun = latestDirectory('assessments/dress-up/inspection-report/GEN-013');
    if (dressUpRun) {
      const generated = await fetchJson(`${dashboard.url}/api/executive-report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_dir: dressUpRun })
      });
      assert(generated.md_path?.endsWith('executive-report.md'), 'Executive report generation did not return a markdown path.');
      const executive = readJson(generated.json_path);
      assert(executive.generated_from_inspection, 'Executive report missing inspection provenance.');
      assert(Array.isArray(executive.scorecard) && executive.scorecard.length >= 3, 'Executive report scorecard missing surfaces.');
      assert(executive.scorecard.every((entry) => entry.status !== 'observed' || (typeof entry.score === 'number' && entry.formula)), 'Observed scorecard entries must carry an explainable score and formula.');
      assert(Array.isArray(executive.limitations) && executive.limitations.length > 0, 'Executive report must state limitations.');
      const markdown = await fetchText(`${dashboard.url}/artifact?path=${encodeURIComponent(generated.md_path)}`);
      assert(markdown.includes('Executive Report'), 'Executive report markdown missing title.');
      assert(markdown.includes('No new site inspection was performed'), 'Executive report markdown missing no-re-inspection statement.');
      assert(markdown.includes('What This Report Does Not Claim'), 'Executive report markdown missing limitations section.');
      const detailWithReport = await fetchJson(`${dashboard.url}/api/inspection/${encodeURIComponent(path.basename(dressUpRun))}`);
      assert(detailWithReport.executive_report?.md_path, 'Inspection detail does not surface the generated executive report.');

      const { spawnSync } = await import('node:child_process');
      const latexmkPresent = spawnSync('latexmk', ['--version'], { stdio: 'ignore' }).status === 0;
      if (latexmkPresent) {
        assert(generated.pdf_path?.endsWith('executive-report.pdf'), 'Executive report generation did not render a PDF despite latexmk being available.');
        assert(exists(generated.pdf_path), 'Rendered executive PDF file is missing.');
        const pdfInfo = spawnSync('pdfinfo', [generated.pdf_path], { encoding: 'utf8' });
        if (pdfInfo.status === 0) {
          const pages = Number((pdfInfo.stdout.match(/Pages:\s+(\d+)/) || [])[1] || 0);
          assert(pages >= 3, `Executive PDF should have at least 3 pages, found ${pages}.`);
        }
        const pdfText = spawnSync('pdftotext', [generated.pdf_path, '-'], { encoding: 'utf8' });
        if (pdfText.status === 0) {
          const flatText = pdfText.stdout.replace(/\s+/g, ' ');
          assert(flatText.includes('Product Discovery Executive Report'), 'Executive PDF missing report title.');
          assert(flatText.includes('No new site inspection was performed'), 'Executive PDF missing no-re-inspection statement.');
          assert(flatText.includes('What This Report Does Not Claim'), 'Executive PDF missing limitations section.');
          assert(flatText.includes('Northvalley Intelligence'), 'Executive PDF missing brand closeout.');
        }
      } else {
        console.warn('latexmk not available; executive PDF assertions skipped.');
      }
    }

    assert(page.includes("'/api/curate-queries'"), 'Dashboard page missing curation API wiring.');
    assert(page.includes("'/api/fix-plan'"), 'Dashboard page missing fix plan API wiring.');
    assert(page.includes("'/api/verify-fixes'"), 'Dashboard page missing fix verification API wiring.');
    assert(page.includes("'/api/verify-fixes-live'"), 'Dashboard page missing live verification API wiring.');

    const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-validate-'));
    const scratch = await createDashboardServer({ port: 0, host: '127.0.0.1', rootDir: scratchRoot });
    try {
      const onboarded = await fetchJson(`${scratch.url}/api/onboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.example-boutique.com/', name: 'Example Boutique' })
      });
      assert(onboarded.created === true, 'Onboarding did not create manifests.');
      assert(onboarded.target_id === 'example-boutique', `Unexpected onboarded target id: ${onboarded.target_id}`);
      const targetManifest = readJson(path.join(scratchRoot, onboarded.target));
      const evaluationManifest = readJson(path.join(scratchRoot, onboarded.evaluation));
      const queryPack = readJson(path.join(scratchRoot, onboarded.query_pack));
      assert(targetManifest.platform.expected === 'shopify', 'Onboarded target must declare the Shopify-supported path.');
      assert(evaluationManifest.generation === 'GEN-014', 'Onboarded evaluation must run under GEN-014.');
      assert(evaluationManifest.platform_validation.minimum_maturity_level === 2, 'Onboarded evaluation must require maturity level 2 per decision 3A.');
      assert(queryPack.queries.length >= 5, 'Onboarded starter query pack must include at least five queries.');
      assert(queryPack.queries.every((query) => query.query_id && query.query && query.intent && query.provenance), 'Starter queries missing required fields.');
      const again = await fetchJson(`${scratch.url}/api/onboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'example-boutique.com' })
      });
      assert(again.created === false, 'Re-onboarding the same domain should reuse existing manifests.');
      const badOnboard = await fetch(`${scratch.url}/api/onboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'not a url' })
      });
      assert(badOnboard.status === 400, 'Onboarding did not reject an invalid URL.');

      const fakeRun = path.join('assessments', 'example-boutique', 'inspection-report', 'GEN-014', 'GEN-014-00000000T000000Z');
      fs.mkdirSync(path.join(scratchRoot, fakeRun), { recursive: true });
      fs.writeFileSync(
        path.join(scratchRoot, fakeRun, 'inspection-report.json'),
        JSON.stringify({ inspection_id: 'GEN-014-00000000T000000Z', target: { target_id: 'example-boutique', name: 'Example Boutique' } })
      );
      fs.writeFileSync(
        path.join(scratchRoot, fakeRun, 'site-profile.json'),
        JSON.stringify({
          catalog_discovery: {
            collections: [
              { title: 'Maxi Dresses', handle: 'maxi-dresses', products_count: 120 },
              { title: 'New Arrivals', handle: 'new-arrivals', products_count: 300 },
              { title: 'Denim Shorts', handle: 'denim-shorts', products_count: 45 },
              { title: '$10 & Under Clearance Sale Items', handle: '10-under-sale', products_count: 900 },
              { title: 'Wedding Guest', handle: 'wedding-guest', products_count: 80 }
            ],
            products: [
              { title: 'Blue Floral Maxi Dress', handle: 'blue-floral', product_type: 'Dresses' },
              { title: 'White Denim Shorts', handle: 'white-denim', product_type: 'Shorts' }
            ]
          }
        })
      );
      const curated = await fetchJson(`${scratch.url}/api/curate-queries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_dir: fakeRun })
      });
      assert(curated.queries >= 5, 'Curation should yield at least five queries from catalog evidence.');
      const curatedPack = readJson(path.join(scratchRoot, curated.query_pack));
      assert(curatedPack.queries.some((query) => query.expected_relationships?.[0]?.browse_node === 'maxi-dresses'), 'Curated pack missing collection-backed relationship.');
      assert(curatedPack.queries.every((query) => query.query_id && query.query && query.intent && query.provenance), 'Curated queries missing required fields.');
      assert(!curatedPack.queries.some((query) => /\$|clearance/i.test(query.query)), 'Curated queries should clean price/clearance noise from collection titles.');
      const updatedEvaluation = readJson(path.join(scratchRoot, onboarded.evaluation));
      assert(updatedEvaluation.query_packs[0] === curated.query_pack, 'Curation should point the evaluation manifest at the curated pack.');
      const emptyRun = path.join('assessments', 'example-boutique', 'inspection-report', 'GEN-014', 'GEN-014-00000000T000001Z');
      fs.mkdirSync(path.join(scratchRoot, emptyRun), { recursive: true });
      fs.writeFileSync(path.join(scratchRoot, emptyRun, 'inspection-report.json'), JSON.stringify({ inspection_id: 'x', target: { target_id: 'example-boutique' } }));
      fs.writeFileSync(path.join(scratchRoot, emptyRun, 'site-profile.json'), JSON.stringify({ catalog_discovery: {} }));
      const noEvidence = await fetch(`${scratch.url}/api/curate-queries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_dir: emptyRun })
      });
      assert(noEvidence.status === 400, 'Curation should refuse when no catalog payloads are retained.');

      const fixRun = path.join('assessments', 'example-boutique', 'inspection-report', 'GEN-014', 'GEN-014-00000000T000002Z');
      fs.mkdirSync(path.join(scratchRoot, fixRun, 'executive'), { recursive: true });
      fs.mkdirSync(path.join(scratchRoot, fixRun, 'evidence', 'experiments'), { recursive: true });
      fs.writeFileSync(
        path.join(scratchRoot, fixRun, 'inspection-report.json'),
        JSON.stringify({ inspection_id: 'GEN-014-00000000T000002Z', target: { target_id: 'example-boutique', name: 'Example Boutique' } })
      );
      fs.writeFileSync(
        path.join(scratchRoot, fixRun, 'executive', 'executive-report.json'),
        JSON.stringify({
          generated_from_inspection: 'GEN-014-00000000T000002Z',
          target: { target_id: 'example-boutique', name: 'Example Boutique' },
          findings: [
            {
              type: 'issue',
              surface: 'Search',
              severity: 'High',
              observation: 'The query "linen blazer" returned zero results.',
              recommendation: 'Check catalog coverage and synonyms for "linen blazer".',
              evidence: 'x'
            }
          ]
        })
      );
      fs.writeFileSync(
        path.join(scratchRoot, fixRun, 'evidence', 'experiments', 'submitted-search.jsonl'),
        `${JSON.stringify({ query: 'linen blazer', ok: true, duration_ms: 300, observed: { result_count_hint: 0 } })}\n`
      );
      const fixPlan = await fetchJson(`${scratch.url}/api/fix-plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_dir: fixRun })
      });
      assert(fixPlan.items === 1 && fixPlan.open_items === 1, 'Fix plan should contain one open item from the issue.');
      const failVerify = await fetchJson(`${scratch.url}/api/verify-fixes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_dir: fixRun })
      });
      assert(failVerify.still_failing === 1 && failVerify.verified_items === 0, 'Verification against unfixed evidence should report still_failing.');
      fs.writeFileSync(
        path.join(scratchRoot, fixRun, 'evidence', 'experiments', 'submitted-search.jsonl'),
        `${JSON.stringify({ query: 'linen blazer', ok: true, duration_ms: 300, observed: { result_count_hint: 42 } })}\n`
      );
      const passVerify = await fetchJson(`${scratch.url}/api/verify-fixes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_dir: fixRun })
      });
      assert(passVerify.verified_items === 1 && passVerify.open_items === 0, 'Verification against fixed evidence should flip the item to verified_fixed.');
      const scratchPlan = readJson(path.join(scratchRoot, 'assessments', 'example-boutique', 'fix-plan.json'));
      assert(scratchPlan.items[0].status === 'verified_fixed', 'Fix plan item should be verified_fixed after passing verification.');
      assert(scratchPlan.items[0].history.length === 2, 'Fix plan item should record verification history.');
    } finally {
      await new Promise((resolve) => scratch.server.close(resolve));
      fs.rmSync(scratchRoot, { recursive: true, force: true });
    }
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
