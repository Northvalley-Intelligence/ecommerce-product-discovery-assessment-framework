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

const RUN_DIR_PATTERN = /^GEN-\d{3}-\d{8}T\d{6}Z$/;

// Pick a run directory to validate against whatever exists on disk. Prefer an
// explicit arg, then a Ridge GEN-013 run (historical default), then the newest
// run of any target. The validator must not hard-depend on one specific run
// existing - the operator cleans and creates runs freely.
function pickRunDir() {
  if (process.argv[2]) return process.argv[2];
  const ridge = latestDirectory('assessments/ridge/inspection-report/GEN-013');
  if (ridge) return ridge;
  const assessmentsDir = 'assessments';
  if (!exists(assessmentsDir)) return null;
  const runs = [];
  for (const target of fs.readdirSync(assessmentsDir, { withFileTypes: true })) {
    if (!target.isDirectory()) continue;
    const reportRoot = path.join(assessmentsDir, target.name, 'inspection-report');
    if (!exists(reportRoot)) continue;
    for (const generation of fs.readdirSync(reportRoot, { withFileTypes: true })) {
      if (!generation.isDirectory()) continue;
      const genDir = path.join(reportRoot, generation.name);
      for (const run of fs.readdirSync(genDir, { withFileTypes: true })) {
        // Only complete runs (interrupted runs lack inspection-report.json).
        if (run.isDirectory() && RUN_DIR_PATTERN.test(run.name)
          && exists(path.join(genDir, run.name, 'inspection-report.json'))) {
          runs.push(path.join(genDir, run.name));
        }
      }
    }
  }
  runs.sort((left, right) => path.basename(right).localeCompare(path.basename(left)));
  return runs[0] || null;
}

async function main() {
  const runDir = pickRunDir();
  assert(runDir, 'No inspection run directory found for dashboard validation.');
  if (!runDir) {
    console.error('Dashboard validation failed: no inspection run directory on disk.');
    process.exit(1);
  }
  const runReport = readJson(path.join(runDir, 'inspection-report.json'));
  const targetId = runReport?.target?.target_id;
  assert(targetId, `Run ${runDir} has no target_id in inspection-report.json.`);
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
    assert(page.includes('id="newInspectionBtn"'), 'Dashboard page missing New Inspection control.');
    assert(page.includes("'/api/' + kind"), 'Dashboard page missing rerun/resume action API wiring.');
    assert(page.includes('renderSetup'), 'Dashboard page missing the inspection setup view.');

    const inspections = await fetchJson(`${dashboard.url}/api/inspections`);
    assert(Array.isArray(inspections) && inspections.length > 0, 'Dashboard inspections API returned no history rows.');
    const targetRow = inspections.find((row) => row.target_id === targetId);
    assert(targetRow, `Dashboard history does not include the validated target ${targetId}.`);

    const detail = await fetchJson(`${dashboard.url}/api/inspection/${encodeURIComponent(targetRow.inspection_id)}`);
    assert(detail.report?.target?.target_id === targetId, `${targetId} inspection detail did not load.`);
    assert(detail.dashboard?.operational_summary, `${targetId} dashboard detail missing operational summary.`);
    assert(Array.isArray(detail.timeline), `${targetId} inspection detail missing timeline array.`);
    assert(detail.plugin_state?.plugins, `${targetId} inspection detail missing plugin state.`);
    assert(detail.artifact_index?.groups, `${targetId} inspection detail missing artifact index.`);

    assert(typeof runReport.dashboard?.operational_summary?.downstream_report_readiness === 'string'
      && runReport.dashboard.operational_summary.downstream_report_readiness.length > 0,
      `${targetId} run missing a downstream_report_readiness value.`);

    const artifact = await fetchText(
      `${dashboard.url}/artifact?path=${encodeURIComponent(path.join(runDir, 'inspection-report.md'))}`
    );
    assert(artifact.includes('Inspection Report:'), 'Artifact route did not serve inspection report markdown.');

    assert(page.includes('id="tabShared"'), 'Dashboard page missing Shared tab.');
    assert(page.includes('id="tabSettings"'), 'Dashboard page missing Settings tab.');
    assert(page.includes('id="sitesList"'), 'Dashboard page missing persistent sites list.');
    assert(page.includes("'/api/sites'"), 'Dashboard page missing sites API wiring.');
    // GEN-021 site-centric hierarchy: sidebar lists sites, selecting one shows its
    // runs, opening a run traces back to the site via a breadcrumb.
    assert(page.includes('function renderSitesNav'), 'Dashboard page missing site-centric sidebar (renderSitesNav).');
    assert(page.includes('function renderSiteView'), 'Dashboard page missing per-site view (renderSiteView).');
    assert(page.includes('function selectSite'), 'Dashboard page missing site selection (selectSite).');
    assert(page.includes('function openRun'), 'Dashboard page missing run opener (openRun).');
    assert(page.includes('class="site-nav'), 'Dashboard page missing site-nav sidebar entries.');
    assert(page.includes('class="run-card'), 'Dashboard page missing run cards under a site.');
    assert(page.includes('Each run is one inspection of this site'), 'Dashboard page missing site→run framing copy.');
    assert(page.includes('id="crumbSite"'), 'Dashboard page missing run→site breadcrumb link.');

    const sites = await fetchJson(`${dashboard.url}/api/sites`);
    assert(Array.isArray(sites) && sites.length > 0, 'Sites API returned no identified sites.');
    assert(sites.every((site) => site.target_id && site.name && site.evaluation), 'Sites API entries missing required fields.');
    // GEN-025: sites carry their sector membership so the sidebar can group them.
    assert(sites.every((site) => Array.isArray(site.sectors)), 'Sites API entries missing sector membership array.');
    assert(sites.some((site) => site.sectors.length > 0), 'No site reports a sector membership for the grouped sidebar.');
    assert(page.includes('function renderSitesNav') && page.includes('class="site-group"'), 'Dashboard page missing the sector-grouped sidebar.');
    const ridgeSite = sites.find((site) => site.target_id === 'ridge');
    assert(ridgeSite, 'Sites API does not include the Ridge target.');

    const inspectionRows = await fetchJson(`${dashboard.url}/api/inspections`);
    assert(inspectionRows.every((row) => exists(path.join(process.cwd(), row.output_dir))), 'Inspection list contains a phantom run whose directory no longer exists.');
    assert(page.includes('id="queueStrip"'), 'Dashboard page missing run queue strip.');
    assert(page.includes('captures-only'), 'Settings cleanup missing captures-only policy.');
    assert(page.includes("'/api/queue'"), 'Dashboard page missing queue API wiring.');

    const queue = await fetchJson(`${dashboard.url}/api/queue`);
    assert(queue.counts && Array.isArray(queue.pending) && Array.isArray(queue.recent), 'Queue API did not return the expected shape.');
    const capturePreview = await fetchJson(`${dashboard.url}/api/cleanup/preview`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policy: 'captures-only' })
    });
    assert(capturePreview.policy === 'captures-only' && typeof capturePreview.freed_mb === 'number', 'Captures-only cleanup preview did not return freed space.');
    // GEN-022: "Delete all inspection runs" must plan removal of EVERY run,
    // including runs referenced by a fix plan (which used to be silently kept,
    // so a full delete deleted nothing). The reference is surfaced as evidence.
    const allRunsPreview = await fetchJson(`${dashboard.url}/api/cleanup/preview`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policy: 'all-runs' })
    });
    assert(allRunsPreview.runs_kept === 0, 'Delete-all cleanup kept runs; a full delete must remove every run.');
    assert(allRunsPreview.runs_to_remove === allRunsPreview.total_runs, 'Delete-all cleanup does not plan to remove every run on disk.');
    assert(typeof allRunsPreview.referenced_runs_removed === 'number', 'Delete-all cleanup preview does not surface fix-plan-referenced runs as evidence.');
    assert(page.includes('id="datasetView"'), 'Dashboard page missing dataset viewer container.');
    assert(page.includes("'/api/dataset?path='"), 'Dashboard page missing dataset API wiring.');
    // GEN-023: the flat repo-wide Datasets tab is gone; a site's data is shown
    // under the site, and a small Shared entry holds platform + sector data.
    assert(!page.includes('id="tabDatasets"'), 'Flat Datasets tab should be removed in the site-scoped data model.');
    assert(page.includes('id="tabShared"'), 'Dashboard page missing the Shared tab.');
    assert(page.includes('id="siteData"'), 'Site view missing the connected-data section.');
    assert(page.includes('function loadSiteData'), 'Dashboard page missing site-connected data loader.');
    assert(page.includes("'/api/site-data?target='"), 'Dashboard page missing site-data API wiring.');

    // A site groups its own datasets together (manifest, evaluation, query
    // packs, site profile, per-run DS1-DS4).
    const someSite = sites.find((site) => inspectionRows.some((row) => row.target_id === site.target_id)) || sites[0];
    const siteData = await fetchJson(`${dashboard.url}/api/site-data?target=${encodeURIComponent(someSite.target_id)}`);
    assert(Array.isArray(siteData.groups) && siteData.groups.some((group) => group.id === 'manifest'), 'Site data missing the target manifest group.');
    assert(siteData.groups.some((group) => group.id === 'evaluation'), 'Site data missing the evaluation group.');
    assert(Array.isArray(siteData.runs), 'Site data missing runs array.');

    // GEN-026: per-site health summary aggregated from runs + fix plan.
    assert(page.includes('function loadSiteHealth') && page.includes('id="siteHealth"'), 'Site view missing the health summary section.');
    assert(page.includes("'/api/site-health?target='"), 'Dashboard page missing site-health API wiring.');
    const siteHealthData = await fetchJson(`${dashboard.url}/api/site-health?target=${encodeURIComponent(someSite.target_id)}`);
    assert(siteHealthData.inspected === true && siteHealthData.run_count > 0, 'Site-health for an inspected site should report runs.');
    assert(siteHealthData.latest && typeof siteHealthData.latest.readiness === 'string' && 'coverage' in siteHealthData.latest, 'Site-health latest summary missing readiness/coverage.');
    assert('fix_plan' in siteHealthData && Array.isArray(siteHealthData.coverage_trend) && siteHealthData.coverage_trend.length > 0, 'Site-health missing fix_plan/coverage_trend.');
    const uninspected = sites.find((site) => !inspectionRows.some((row) => row.target_id === site.target_id));
    if (uninspected) {
      const emptyHealth = await fetchJson(`${dashboard.url}/api/site-health?target=${encodeURIComponent(uninspected.target_id)}`);
      assert(emptyHealth.inspected === false && emptyHealth.run_count === 0, 'Site-health for an un-inspected site should report an empty state.');
    }

    // Shared holds only non-site data: platform capability model + sectors.
    const shared = await fetchJson(`${dashboard.url}/api/shared`);
    assert(Array.isArray(shared.platform) && shared.platform.length > 0, 'Shared data missing the platform capability model.');
    assert(shared.platform.every((file) => file.path.startsWith('platform/')), 'Shared platform list leaked a non-platform dataset.');
    assert(Array.isArray(shared.sectors), 'Shared data missing sectors array.');
    const memberedSector = shared.sectors.find((sector) => (sector.member_sites || []).length > 0);
    assert(memberedSector, 'No sector dataset is referenced by any site.');
    assert((memberedSector.query_pack_files || []).length > 0, 'Sector dataset has no shared query pack file.');

    // A site sees the sectors it belongs to (connection preserved), and the
    // promote endpoint rejects non-query-pack datasets.
    const memberSiteId = memberedSector.member_sites[0];
    const memberSiteData = await fetchJson(`${dashboard.url}/api/site-data?target=${encodeURIComponent(memberSiteId)}`);
    assert((memberSiteData.sector_membership || []).some((sector) => sector.sector_id === memberedSector.sector_id), 'Member site does not show its sector membership.');
    const badPromote = await fetch(`${dashboard.url}/api/sector/promote`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target_id: memberSiteId, dataset_path: `targets/${memberSiteId}.json`, sector_name: 'Should Reject' })
    });
    assert(badPromote.status === 400, 'Promote endpoint should reject a non-query-pack dataset.');

    // GEN-024: a sector has its own view with a cross-site comparison of its
    // member sites (latest-run metrics), reachable from Shared and from a site.
    assert(page.includes('function renderSectorView'), 'Dashboard page missing the sector view.');
    assert(page.includes("'/api/sector?id='"), 'Dashboard page missing sector API wiring.');
    assert(page.includes('Cross-site comparison'), 'Sector view missing the cross-site comparison table.');
    assert(page.includes('class="link-btn sector-open'), 'Shared/site views missing a link into the sector view.');
    const sectorViewData = await fetchJson(`${dashboard.url}/api/sector?id=${encodeURIComponent(memberedSector.sector_id)}`);
    assert(Array.isArray(sectorViewData.members) && sectorViewData.member_count === sectorViewData.members.length, 'Sector view did not return its member sites.');
    assert(sectorViewData.members.some((member) => member.target_id === memberSiteId), 'Sector view comparison is missing a known member site.');
    assert(Array.isArray(sectorViewData.query_pack_files) && sectorViewData.query_pack_files.length > 0, 'Sector view missing its shared query packs.');
    assert(sectorViewData.members.every((member) => 'latest_run' in member && 'run_count' in member), 'Sector member rows missing comparison fields.');
    const missingSector = await fetch(`${dashboard.url}/api/sector?id=no-such-sector`);
    assert(missingSector.status === 404, 'Sector API should 404 for an unknown sector.');

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

    // Use the history file for the validated run's generation, since older
    // generations' history is pruned as their runs are cleaned.
    const runGeneration = path.basename(path.dirname(runDir));
    const historyDataset = await fetchJson(`${dashboard.url}/api/dataset?path=${encodeURIComponent('inspection-history/' + runGeneration + '.jsonl')}`);
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

    assert(page.includes("'/api/inspection-config'"), 'Dashboard page missing inspection setup API wiring.');
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
    fs.mkdirSync(path.join(scratchRoot, 'platform'), { recursive: true });
    for (const platformFile of ['capability-registry.json', 'capability-maturity.json']) {
      fs.copyFileSync(path.join('platform', platformFile), path.join(scratchRoot, 'platform', platformFile));
    }
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

      const registryPath = path.join(scratchRoot, 'platform', 'capability-registry.json');
      const scratchRegistry = readJson(registryPath);
      const p005 = scratchRegistry.capabilities.find((capability) => capability.capability_id === 'P005');
      const savedStatus = p005.status;
      p005.status = 'planned';
      fs.writeFileSync(registryPath, JSON.stringify(scratchRegistry));
      const gated = await fetch(`${scratch.url}/api/onboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://gated-example.com' })
      });
      const gatedBody = await gated.json();
      assert(gated.status === 400 && /maturity/i.test(gatedBody.error || ''), 'Onboarding should enforce the decision-3A maturity gate when Level 2 capabilities are missing.');
      p005.status = savedStatus;
      fs.writeFileSync(registryPath, JSON.stringify(scratchRegistry));

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
            ],
            attribute_expectation_note: 'blue, floral, white, denim should be observed as attributes'
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
      assert(
        curatedPack.queries.some((query) => query.expected_relationships.some((rel) => rel.type === 'attribute' && rel.attribute)),
        'Curated pack should carry attribute relationships observed from product titles (DS3 source).'
      );
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
