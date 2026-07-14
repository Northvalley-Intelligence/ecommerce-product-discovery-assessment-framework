#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, readJsonl, writeJson } from '../lib/fs-json.mjs';

// Fix-assist (charter item 2): turn executive report issues into a durable,
// target-level fix plan whose items carry machine-verifiable criteria. A later
// re-inspection verifies each item automatically - the platform observes
// whether the fix worked instead of asking anyone to trust that it did.

const GUIDANCE = {
  zero_result_query:
    'Shopify: check whether matching products exist and are published to the Online Store channel; add the phrase to product titles/tags or configure a synonym in the storefront search app; design the zero-result page to suggest alternatives.',
  failed_query:
    'Shopify: reproduce the failing request; check theme search template errors, app proxy timeouts, or rate limiting on the search endpoint.',
  slow_query:
    'Shopify: profile the search request; heavy theme sections, unoptimized search apps, or app proxy round-trips are the usual causes.',
  unassisted_prefix:
    'Shopify: check predictive search settings (or the search app’s suggestion index) for this prefix; ensure suggestions are enabled for products, collections, and queries.',
  invisible_dropdown:
    'Shopify: the suggest endpoint answers but customers see no dropdown for this query. Check the storefront search app configuration, theme predictive-search integration, and JavaScript errors on the storefront.',
  rendered_no_products:
    'Shopify: the search endpoint returns results but the rendered page shows no product tiles. Check the theme search template and any search app’s frontend rendering for this query pattern.'
};

function classifyIssue(finding) {
  const text = finding.observation || '';
  let match = text.match(/^The query "(.+)" returned zero results\.$/);
  if (match) return { type: 'zero_result_query', query: match[1] };
  match = text.match(/^The search request for "(.+)" failed outright\.$/);
  if (match) return { type: 'failed_query', query: match[1] };
  match = text.match(/^The query "(.+)" took (\d+) ms/);
  if (match) return { type: 'slow_query', query: match[1] };
  match = text.match(/^Typing "(.+)" produced no suggestions\.$/);
  if (match) return { type: 'unassisted_prefix', query: match[1] };
  match = text.match(/^Typing "(.+)" showed no visible autocomplete suggestions/);
  if (match) return { type: 'invisible_dropdown', query: match[1] };
  match = text.match(/^The rendered page for "(.+)" loaded but showed no products/);
  if (match) return { type: 'rendered_no_products', query: match[1] };
  return null;
}

function fingerprint(item) {
  return `${item.type}:${item.query}`;
}

function evaluateCriterion(item, evidence) {
  const bySearchQuery = new Map(evidence.search.map((row) => [row.query, row]));
  const byAutocompleteQuery = new Map(evidence.autocomplete.map((row) => [row.typed_prefix, row]));
  const byRenderedQuery = new Map(evidence.rendered.map((row) => [row.query, row]));

  if (item.type === 'zero_result_query' || item.type === 'failed_query') {
    const row = bySearchQuery.get(item.query);
    if (!row) return { checked: false, note: 'Query was not part of this inspection run.' };
    const passed = row.ok === true && (row.observed?.result_count_hint ?? 0) > 0;
    return { checked: true, passed, observed: `ok=${row.ok}, result_count_hint=${row.observed?.result_count_hint ?? null}` };
  }
  if (item.type === 'slow_query') {
    const row = bySearchQuery.get(item.query);
    if (!row) return { checked: false, note: 'Query was not part of this inspection run.' };
    const passed = row.ok === true && (row.duration_ms ?? Infinity) <= 1500;
    return { checked: true, passed, observed: `duration_ms=${row.duration_ms}` };
  }
  if (item.type === 'unassisted_prefix') {
    const row = byAutocompleteQuery.get(item.query);
    if (!row) return { checked: false, note: 'Prefix was not part of this inspection run.' };
    const passed = row.ok === true && (row.observed?.suggestion_count ?? 0) > 0;
    return { checked: true, passed, observed: `suggestion_count=${row.observed?.suggestion_count ?? null}` };
  }
  if (item.type === 'invisible_dropdown') {
    const row = byRenderedQuery.get(item.query);
    if (!row) return { checked: false, note: 'Query was not rendered in this inspection run.' };
    const passed = row.endpoint_comparison?.visible_dropdown_observed === true;
    return { checked: true, passed, observed: `visible_suggestion_count=${row.endpoint_comparison?.visible_suggestion_count ?? 0}` };
  }
  if (item.type === 'rendered_no_products') {
    const row = byRenderedQuery.get(item.query);
    if (!row) return { checked: false, note: 'Query was not rendered in this inspection run.' };
    const passed = row.rendered_search?.ok === true && (row.rendered_search.observed?.visible_product_count ?? 0) > 0;
    return { checked: true, passed, observed: `visible_product_count=${row.rendered_search?.observed?.visible_product_count ?? null}` };
  }
  return { checked: false, note: `No verifier for type ${item.type}.` };
}

function readRunEvidence(rootDir, runDir) {
  const resolvedRunDir = path.isAbsolute(runDir) ? runDir : path.join(rootDir, runDir);
  const experiments = path.join(resolvedRunDir, 'evidence', 'experiments');
  const load = (name) => (exists(path.join(experiments, name)) ? readJsonl(path.join(experiments, name)) : []);
  return {
    search: load('submitted-search.jsonl'),
    autocomplete: load('autocomplete.jsonl'),
    rendered: load('rendered-search.jsonl')
  };
}

function fixPlanPath(rootDir, targetId) {
  return path.join(rootDir, 'assessments', targetId, 'fix-plan.json');
}

function loadRunReport(rootDir, runDir) {
  const resolvedRunDir = path.isAbsolute(runDir) ? runDir : path.join(rootDir, runDir);
  const executivePath = path.join(resolvedRunDir, 'executive', 'executive-report.json');
  if (!exists(executivePath)) {
    throw new Error('No executive-report.json in this run; generate the executive report first.');
  }
  return readJson(executivePath);
}

export function generateFixPlan(rootDir, runDir) {
  const executive = loadRunReport(rootDir, runDir);
  const targetId = executive.target?.target_id;
  if (!targetId) throw new Error('Executive report has no target_id.');

  const planPath = fixPlanPath(rootDir, targetId);
  const existing = exists(planPath) ? readJson(planPath) : null;
  const existingByFingerprint = new Map((existing?.items || []).map((item) => [fingerprint(item), item]));

  const issues = (executive.findings || []).filter((finding) => finding.type === 'issue');
  const items = [];
  const unmappable = [];
  for (const finding of issues) {
    const classified = classifyIssue(finding);
    if (!classified) {
      unmappable.push(finding.observation);
      continue;
    }
    const key = `${classified.type}:${classified.query}`;
    const prior = existingByFingerprint.get(key);
    items.push({
      fingerprint: key,
      type: classified.type,
      query: classified.query,
      surface: finding.surface,
      severity: finding.severity,
      observation: finding.observation,
      recommendation: finding.recommendation,
      implementation_guidance: GUIDANCE[classified.type],
      verification: {
        method: 'automatic_reinspection',
        criterion: `Re-inspect and confirm the ${classified.type.replaceAll('_', ' ')} condition no longer holds for "${classified.query}".`
      },
      status: prior?.status === 'verified_fixed' ? 'regressed' : prior?.status || 'open',
      first_observed_in: prior?.first_observed_in || executive.generated_from_inspection,
      last_observed_in: executive.generated_from_inspection,
      evidence: finding.evidence,
      history: prior?.history || []
    });
    existingByFingerprint.delete(key);
  }

  // Items no longer reported as issues stay in the plan until a verification
  // run confirms them fixed; verified items are retained as the fix record.
  for (const [, prior] of existingByFingerprint) {
    items.push(prior);
  }

  const plan = {
    schema_version: 'fix-plan-v0.1',
    target_id: targetId,
    target_name: executive.target?.name,
    updated_at: new Date().toISOString(),
    updated_from_inspection: executive.generated_from_inspection,
    open_items: items.filter((item) => item.status === 'open' || item.status === 'still_failing' || item.status === 'regressed').length,
    verified_items: items.filter((item) => item.status === 'verified_fixed').length,
    items,
    unmappable_findings: unmappable,
    rule: 'Every item carries a machine-verifiable criterion; statuses change only through verification runs, never by assertion.'
  };
  writeJson(planPath, plan);
  return {
    fix_plan: path.relative(rootDir, planPath),
    target_id: targetId,
    items: items.length,
    open_items: plan.open_items,
    verified_items: plan.verified_items,
    unmappable_findings: unmappable.length
  };
}

export function verifyFixPlan(rootDir, runDir) {
  const resolvedRunDir = path.isAbsolute(runDir) ? runDir : path.join(rootDir, runDir);
  const reportPath = path.join(resolvedRunDir, 'inspection-report.json');
  if (!exists(reportPath)) throw new Error(`No inspection-report.json in ${runDir}.`);
  const report = readJson(reportPath);
  const targetId = report.target?.target_id;
  const planPath = fixPlanPath(rootDir, targetId);
  if (!exists(planPath)) throw new Error(`No fix plan exists for ${targetId}; generate one from an executive report first.`);

  const plan = readJson(planPath);
  const evidence = readRunEvidence(rootDir, runDir);
  const inspectionId = report.inspection_id;
  let verified = 0;
  let stillFailing = 0;
  let unchecked = 0;

  for (const item of plan.items) {
    const result = evaluateCriterion(item, evidence);
    if (!result.checked) {
      unchecked += 1;
      item.history.push({ inspection_id: inspectionId, at: new Date().toISOString(), result: 'not_checked', note: result.note });
      continue;
    }
    if (result.passed) {
      if (item.status !== 'verified_fixed') verified += 1;
      item.status = 'verified_fixed';
      item.verified_in = inspectionId;
    } else {
      stillFailing += 1;
      item.status = 'still_failing';
    }
    item.history.push({
      inspection_id: inspectionId,
      at: new Date().toISOString(),
      result: result.passed ? 'verified_fixed' : 'still_failing',
      observed: result.observed
    });
  }

  plan.updated_at = new Date().toISOString();
  plan.last_verification_inspection = inspectionId;
  plan.open_items = plan.items.filter((item) => ['open', 'still_failing', 'regressed'].includes(item.status)).length;
  plan.verified_items = plan.items.filter((item) => item.status === 'verified_fixed').length;
  writeJson(planPath, plan);

  return {
    fix_plan: path.relative(rootDir, planPath),
    target_id: targetId,
    verified_this_run: verified,
    still_failing: stillFailing,
    not_checked: unchecked,
    open_items: plan.open_items,
    verified_items: plan.verified_items
  };
}

export function readFixPlan(rootDir, targetId) {
  const planPath = fixPlanPath(rootDir, targetId);
  return exists(planPath) ? readJson(planPath) : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, runDir] = process.argv.slice(2);
  if (!command || !runDir || !['generate', 'verify'].includes(command)) {
    console.error('Usage: node src/evaluator/fix-plan.mjs <generate|verify> <inspection-run-dir>');
    process.exit(1);
  }
  const result = command === 'generate' ? generateFixPlan(process.cwd(), runDir) : verifyFixPlan(process.cwd(), runDir);
  console.log(JSON.stringify(result, null, 2));
}
