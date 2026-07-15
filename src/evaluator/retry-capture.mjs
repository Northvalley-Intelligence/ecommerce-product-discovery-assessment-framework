#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, readJsonl, writeJson } from '../lib/fs-json.mjs';
import { createRenderedSession } from '../lib/rendered-evidence.mjs';
import { generateExecutiveReport } from './generate-executive-report.mjs';
import {
  buildCrawlHealth,
  collectLimitations,
  evidenceCoverage,
  summarizePluginEvidence
} from './run-inspection.mjs';

// Per-URL retry: re-capture a single rendered URL that previously hit a
// transient wall (429 / bot challenge / timeout). If it now succeeds, patch the
// evidence row and re-derive the report's evidence-based sections so the warning
// clears and any generated executive report reflects the new reality.

const RETRYABLE_PLUGINS = {
  'rendered-product': { file: 'rendered-product.jsonl', key: 'product_handle' },
  'rendered-search': { file: 'rendered-search.jsonl', key: 'query_id' }
};

function writeJsonl(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
}

function screenshotPath(runDir, plugin, key) {
  const dir = path.join(runDir, 'evidence', 'screenshots');
  return plugin === 'rendered-product'
    ? path.join(dir, `rendered-product-${key}.png`)
    : path.join(dir, `rendered-search-${key}.png`);
}

export async function retryCapture(rootDir, { run_dir, plugin_id, key } = {}) {
  const config = RETRYABLE_PLUGINS[plugin_id];
  if (!config) throw new Error(`Retry is not supported for plugin ${plugin_id}.`);
  const resolvedRunDir = path.isAbsolute(run_dir) ? run_dir : path.join(rootDir, run_dir);
  const reportPath = path.join(resolvedRunDir, 'inspection-report.json');
  if (!exists(reportPath)) throw new Error(`No inspection-report.json in ${run_dir}.`);
  const report = readJson(reportPath);

  const evidenceFile = path.join(resolvedRunDir, 'evidence', 'experiments', config.file);
  const rows = readJsonl(evidenceFile);
  const index = rows.findIndex((row) => row[config.key] === key);
  if (index < 0) throw new Error(`No captured record found for ${config.key}=${key}.`);
  const row = rows[index];
  const url = row.endpoint || row.rendered_search?.endpoint;
  if (!url) throw new Error('Captured record has no URL to retry.');

  const target = report.target || {};
  const session = await createRenderedSession({
    userAgent: target.inspection_defaults?.user_agent,
    timeoutMs: target.inspection_defaults?.timeout_ms ? target.inspection_defaults.timeout_ms + 10000 : undefined
  });

  let cleared = false;
  try {
    if (plugin_id === 'rendered-product') {
      const capture = await session.captureProductPage(url, screenshotPath(resolvedRunDir, plugin_id, key));
      const observed = capture.observed || {};
      rows[index] = {
        ...row,
        endpoint: url,
        final_url: capture.final_url,
        status: capture.status,
        ok: capture.ok,
        duration_ms: capture.duration_ms,
        classification: capture.classification,
        screenshot: capture.screenshot || row.screenshot,
        observed,
        completeness: {
          has_price: !!observed.price,
          has_title: !!observed.product_title,
          has_image: (observed.image_count || 0) > 0,
          has_variants: (observed.variant_option_count || 0) > 0,
          add_to_cart_present: !!observed.add_to_cart_present
        },
        confidence: capture.ok ? 'High' : 'Low',
        evidence_quality: capture.ok ? 'rendered_browser_capture' : 'limitation_record',
        retried_at: new Date().toISOString()
      };
      cleared = capture.ok;
    } else {
      // rendered-search: retry the search page portion of the row.
      const pageCapture = await session.captureSearchPage(url, screenshotPath(resolvedRunDir, plugin_id, key));
      rows[index] = {
        ...row,
        rendered_search: {
          ...row.rendered_search,
          endpoint: url,
          final_url: pageCapture.final_url,
          status: pageCapture.status,
          ok: pageCapture.ok,
          duration_ms: pageCapture.duration_ms,
          classification: pageCapture.classification,
          screenshot: pageCapture.screenshot || row.rendered_search?.screenshot,
          observed: pageCapture.observed
        },
        retried_at: new Date().toISOString()
      };
      cleared = pageCapture.ok;
    }
  } finally {
    await session.close();
  }

  writeJsonl(evidenceFile, rows);

  // Re-derive the report's evidence-based sections from the patched evidence.
  const siteProfile = readJson(path.join(resolvedRunDir, 'site-profile.json'));
  const platformReport = exists(path.join(resolvedRunDir, 'platform-capability-report.json'))
    ? readJson(path.join(resolvedRunDir, 'platform-capability-report.json'))
    : { checks: [] };
  const pluginIds = (report.plugin_results || []).map((result) => result.plugin_id);
  const pluginResults = pluginIds.map((id) => summarizePluginEvidence(id, resolvedRunDir)).filter(Boolean);
  const crawlHealth = buildCrawlHealth({ siteProfile, pluginResults, evaluation: {} });
  const limitations = collectLimitations({ siteProfile, pluginResults, platformReport });
  const coverage = evidenceCoverage({ crawlHealth, datasetSummary: report.datasets || {}, pluginResults });

  report.plugin_results = pluginResults;
  report.crawl_health = crawlHealth;
  report.limitations = limitations;
  if (report.dashboard) {
    report.dashboard.crawl_health = crawlHealth;
    report.dashboard.evidence_coverage = coverage;
  }
  writeJson(reportPath, report);

  // Regenerate the executive report so its scores/findings reflect the retry.
  let executiveRegenerated = false;
  if (exists(path.join(resolvedRunDir, 'executive', 'executive-report.json'))) {
    generateExecutiveReport(rootDir, path.relative(rootDir, resolvedRunDir));
    executiveRegenerated = true;
  }

  return {
    plugin_id,
    key,
    url,
    warning_cleared: cleared,
    status: cleared ? 'ok' : (rows[index].classification?.code || 'still_limited'),
    executive_report_regenerated: executiveRegenerated
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [run_dir, plugin_id, key] = process.argv.slice(2);
  if (!run_dir || !plugin_id || !key) {
    console.error('Usage: node src/evaluator/retry-capture.mjs <run-dir> <plugin-id> <key>');
    process.exit(1);
  }
  retryCapture(process.cwd(), { run_dir, plugin_id, key }).then((result) => console.log(JSON.stringify(result, null, 2)));
}
