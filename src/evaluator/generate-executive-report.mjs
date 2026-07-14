#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, readJsonl, writeJson, writeText } from '../lib/fs-json.mjs';

// Interpretation layer: this generator reads a completed inspection run directory
// and never contacts the inspected site. Scores, findings, and recommendations are
// allowed here (they are forbidden inside the Inspection Report itself).

const SURFACE_LABELS = {
  'submitted-search': 'Search',
  autocomplete: 'Autocomplete',
  facets: 'Filters & Facets',
  recommendations: 'Recommendations',
  mobile: 'Mobile Experience'
};

const CRAWL_HEALTH_COMPONENTS = {
  'submitted-search': 'Search',
  autocomplete: 'Autocomplete',
  facets: 'Facets',
  recommendations: 'Recommendations',
  mobile: 'Mobile'
};

function readEvidence(rootDir, evidenceFile) {
  if (!evidenceFile) return [];
  const resolved = path.isAbsolute(evidenceFile) ? evidenceFile : path.join(rootDir, evidenceFile);
  return exists(resolved) ? readJsonl(resolved) : [];
}

function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function scoreSearch(records) {
  const total = records.length;
  const withResults = records.filter((record) => record.ok && (record.observed?.result_count_hint ?? 0) > 0).length;
  const zeroResults = records.filter((record) => record.ok && (record.observed?.result_count_hint ?? 0) === 0);
  const failed = records.filter((record) => !record.ok);
  return {
    score: percent(withResults, total),
    formula: 'queries returning at least one result / queries attempted',
    observations: total,
    details: records.map((record) => ({
      query: record.query,
      ok: record.ok,
      http_status: record.status,
      result_count_hint: record.observed?.result_count_hint ?? null,
      response_ms: record.duration_ms
    })),
    zero_result_queries: zeroResults.map((record) => record.query),
    failed_queries: failed.map((record) => record.query)
  };
}

function scoreAutocomplete(records) {
  const total = records.length;
  const assisted = records.filter((record) => record.ok && (record.observed?.suggestion_count ?? 0) > 0).length;
  const unassisted = records.filter((record) => record.ok && (record.observed?.suggestion_count ?? 0) === 0);
  return {
    score: percent(assisted, total),
    formula: 'typed prefixes receiving at least one suggestion / prefixes attempted',
    observations: total,
    details: records.map((record) => ({
      typed_prefix: record.typed_prefix,
      ok: record.ok,
      suggestion_count: record.observed?.suggestion_count ?? null,
      response_ms: record.duration_ms
    })),
    unassisted_prefixes: unassisted.map((record) => record.typed_prefix)
  };
}

function scoreGeneric(records) {
  const total = records.length;
  const ok = records.filter((record) => record.ok).length;
  return {
    score: percent(ok, total),
    formula: 'successful probes / probes attempted',
    observations: total,
    details: records.map((record) => ({
      observation: record.observation || record.probe_id || record.query_id || 'probe',
      endpoint: record.endpoint,
      ok: record.ok,
      http_status: record.status,
      response_ms: record.duration_ms
    }))
  };
}

function buildScorecard(rootDir, report) {
  const health = new Map((report.crawl_health || []).map((entry) => [entry.component, entry]));
  const scorecard = [];
  for (const result of report.plugin_results || []) {
    const label = SURFACE_LABELS[result.plugin_id];
    if (!label) continue;
    const records = readEvidence(rootDir, result.evidence_file);
    const healthEntry = health.get(CRAWL_HEALTH_COMPONENTS[result.plugin_id]);
    if (result.status !== 'pass' || records.length === 0) {
      scorecard.push({
        surface: label,
        plugin_id: result.plugin_id,
        score: null,
        status: 'not_observed',
        reason: healthEntry?.notes || `Plugin status: ${result.status}; no usable evidence records.`,
        confidence: healthEntry?.confidence || 'Unknown',
        observations: records.length
      });
      continue;
    }
    const scored =
      result.plugin_id === 'submitted-search' ? scoreSearch(records)
      : result.plugin_id === 'autocomplete' ? scoreAutocomplete(records)
      : scoreGeneric(records);
    scorecard.push({
      surface: label,
      plugin_id: result.plugin_id,
      status: 'observed',
      confidence: healthEntry?.confidence || 'Unknown',
      evidence_file: result.evidence_file,
      ...scored
    });
  }
  return scorecard;
}

function buildFindings(report, scorecard) {
  const findings = [];
  const target = report.target?.name || 'the store';

  const search = scorecard.find((entry) => entry.plugin_id === 'submitted-search');
  if (search?.status === 'observed') {
    if (search.score === 100) {
      findings.push({
        type: 'strength',
        surface: 'Search',
        severity: 'Positive',
        observation: `Every attempted search query returned products (${search.observations} of ${search.observations}).`,
        evidence: search.evidence_file,
        customer_impact: `Customers searching ${target} with these query styles reach product results instead of dead ends.`,
        business_impact: 'Search is carrying discovery traffic to sellable inventory for the observed query set.',
        recommendation: 'Protect this behavior with a regression query set and broaden coverage beyond the starter queries.'
      });
    }
    for (const query of search.zero_result_queries || []) {
      findings.push({
        type: 'issue',
        surface: 'Search',
        severity: 'High',
        observation: `The query "${query}" returned zero results.`,
        evidence: search.evidence_file,
        customer_impact: 'Customers using this wording hit a dead end and must guess new terms or leave.',
        business_impact: 'Zero-result searches are directly abandoned demand.',
        recommendation: `Check catalog coverage, synonyms, and normalization for "${query}", and design the zero-result page to offer recovery paths.`
      });
    }
    for (const query of search.failed_queries || []) {
      findings.push({
        type: 'issue',
        surface: 'Search',
        severity: 'High',
        observation: `The search request for "${query}" failed outright.`,
        evidence: search.evidence_file,
        customer_impact: 'Customers see an error or empty page instead of results.',
        business_impact: 'Failed search requests silently lose ready-to-buy visitors.',
        recommendation: 'Investigate the failing endpoint before drawing relevance conclusions.'
      });
    }
    const slow = (search.details || []).filter((detail) => (detail.response_ms ?? 0) > 1500);
    for (const detail of slow) {
      findings.push({
        type: 'issue',
        surface: 'Search',
        severity: 'Medium',
        observation: `The query "${detail.query}" took ${detail.response_ms} ms to respond.`,
        evidence: search.evidence_file,
        customer_impact: 'Perceived slowness increases abandonment on search, especially on mobile.',
        business_impact: 'Slow discovery reduces conversion on high-intent traffic.',
        recommendation: 'Profile search latency; anything approaching two seconds deserves attention.'
      });
    }
  }

  const autocomplete = scorecard.find((entry) => entry.plugin_id === 'autocomplete');
  if (autocomplete?.status === 'observed') {
    if (autocomplete.score === 100) {
      findings.push({
        type: 'strength',
        surface: 'Autocomplete',
        severity: 'Positive',
        observation: `Every typed prefix received suggestions (${autocomplete.observations} of ${autocomplete.observations}).`,
        evidence: autocomplete.evidence_file,
        customer_impact: 'Customers get guidance before submitting a search, reducing typing effort and misses.',
        business_impact: 'Assisted queries convert better than unassisted ones.',
        recommendation: 'Verify the visible dropdown matches the API suggestions once rendered capture (P008) lands.'
      });
    }
    for (const prefix of autocomplete.unassisted_prefixes || []) {
      findings.push({
        type: 'issue',
        surface: 'Autocomplete',
        severity: 'Medium',
        observation: `Typing "${prefix}" produced no suggestions.`,
        evidence: autocomplete.evidence_file,
        customer_impact: 'Customers typing this get no assistance and must compose the full query themselves.',
        business_impact: 'Unassisted journeys have higher effort and higher abandonment risk.',
        recommendation: `Review suggestion coverage for "${prefix}" and similar prefixes.`
      });
    }
  }

  for (const entry of scorecard.filter((item) => item.status === 'not_observed')) {
    findings.push({
      type: 'coverage_gap',
      surface: entry.surface,
      severity: 'Informational',
      observation: `${entry.surface} could not be observed: ${entry.reason}`,
      evidence: null,
      customer_impact: 'Unknown — this report makes no claims about this surface.',
      business_impact: 'Unknown until the surface is inspected.',
      recommendation: 'Resolve the inspection limitation before drawing conclusions about this surface.'
    });
  }

  return findings;
}

function buildOpportunities(findings) {
  return findings
    .filter((finding) => finding.type === 'issue')
    .map((finding) => ({
      surface: finding.surface,
      opportunity: finding.recommendation,
      classification: finding.severity === 'High' ? 'Quick Win' : 'Strategic Improvement',
      rationale:
        finding.severity === 'High'
          ? 'Directly observed dead end or failure on a live customer path; fixing it recovers demand that already exists.'
          : 'Observed friction that compounds across sessions; worth scheduling rather than firefighting.'
    }));
}

export function generateExecutiveReport(rootDir, runDir) {
  const resolvedRunDir = path.isAbsolute(runDir) ? runDir : path.join(rootDir, runDir);
  const reportPath = path.join(resolvedRunDir, 'inspection-report.json');
  if (!exists(reportPath)) throw new Error(`No inspection-report.json in ${runDir}.`);
  const report = readJson(reportPath);
  const dashboard = report.dashboard || {};
  const summary = dashboard.crawl_summary || {};
  const coverage = dashboard.evidence_coverage || {};

  const scorecard = buildScorecard(rootDir, report);
  const findings = buildFindings(report, scorecard);
  const opportunities = buildOpportunities(findings);
  const strengths = findings.filter((finding) => finding.type === 'strength');
  const issues = findings.filter((finding) => finding.type === 'issue');
  const gaps = findings.filter((finding) => finding.type === 'coverage_gap');
  const observedSurfaces = scorecard.filter((entry) => entry.status === 'observed');

  const limitations = [
    ...(report.limitations?.platform_capability_gaps || []).map(
      (gap) => `Platform capability ${gap.capability_id} (${gap.name}) is not implemented; related evidence is unavailable.`
    ),
    ...(report.limitations?.infrastructure_limitations || []).map(
      (limit) => `${limit.label || limit.code || 'Infrastructure limitation'}: ${limit.status || ''} ${limit.url || limit.endpoint || ''}`.trim()
    ),
    `Scores are directional, computed from ${observedSurfaces.reduce((sum, entry) => sum + (entry.observations || 0), 0)} bounded endpoint observations, not a full catalog benchmark.`,
    'No rendered-UI evidence was captured; visible layout, imagery, and interaction quality are out of scope for this report.'
  ];

  const executive = {
    schema_version: 'executive-report-v0.1',
    report_type: 'application_generated_executive_report',
    generated_from_inspection: report.inspection_id,
    inspection_run_dir: path.relative(rootDir, resolvedRunDir),
    target: {
      name: report.target?.name,
      target_id: report.target?.target_id,
      url: report.target?.primary_url
    },
    inspection_context: {
      inspected_at: report.generated_at,
      platform_detection: summary.platform_detection || null,
      overall_inspection_status: summary.overall_inspection_status,
      overall_confidence: summary.overall_confidence,
      evidence_quality: summary.evidence_quality,
      component_coverage_percent: coverage.component_coverage_percent ?? null
    },
    evidence_basis:
      'Generated entirely from the referenced Inspection Report and its retained evidence. No new site inspection was performed.',
    scorecard,
    findings,
    opportunities,
    limitations
  };

  const targetName = report.target?.name || 'Target';
  const md = [];
  md.push(`# Product Discovery Executive Report: ${targetName}`);
  md.push('');
  md.push(`**Site:** ${report.target?.primary_url || 'unknown'}  `);
  md.push(`**Evidence basis:** Inspection \`${report.inspection_id}\` (${report.generated_at}), ${summary.overall_inspection_status || 'unknown'} inspection, ${summary.overall_confidence || 'Unknown'} confidence, ${coverage.component_coverage_percent ?? '?'}% component coverage.  `);
  md.push(`**Method:** ${executive.evidence_basis}`);
  md.push('');
  md.push('## Executive Summary');
  md.push('');
  const summaryBits = [];
  if (summary.platform_detection?.platform) {
    summaryBits.push(`${targetName} runs on ${summary.platform_detection.platform} (detected at ${summary.platform_detection.confidence} confidence).`);
  }
  if (observedSurfaces.length) {
    summaryBits.push(
      `Across ${observedSurfaces.length} observed discovery surfaces, ${strengths.length} strength${strengths.length === 1 ? '' : 's'} and ${issues.length} issue${issues.length === 1 ? '' : 's'} were identified from the retained evidence.`
    );
  }
  if (gaps.length) {
    summaryBits.push(`${gaps.length} surface${gaps.length === 1 ? ' was' : 's were'} not observable in this inspection and carry no claims here.`);
  }
  md.push(summaryBits.join(' ') || 'The inspection produced no scoreable surfaces; see limitations.');
  md.push('');
  md.push('## Scorecard');
  md.push('');
  md.push('| Surface | Score | Basis | Observations | Confidence |');
  md.push('|---|---|---|---|---|');
  for (const entry of scorecard) {
    md.push(
      entry.status === 'observed'
        ? `| ${entry.surface} | ${entry.score}/100 | ${entry.formula} | ${entry.observations} | ${entry.confidence} |`
        : `| ${entry.surface} | not observed | ${entry.reason} | ${entry.observations} | ${entry.confidence} |`
    );
  }
  md.push('');
  md.push('Scores are directional and explainable: each is the stated ratio over the bounded observation set, not a weighted model.');
  md.push('');
  if (strengths.length) {
    md.push('## What Is Working');
    md.push('');
    for (const finding of strengths) {
      md.push(`- **${finding.surface}:** ${finding.observation} ${finding.business_impact}`);
    }
    md.push('');
  }
  if (issues.length) {
    md.push('## Issues Observed');
    md.push('');
    for (const finding of issues) {
      md.push(`- **[${finding.severity}] ${finding.surface}:** ${finding.observation} ${finding.customer_impact} *Recommendation:* ${finding.recommendation}`);
    }
    md.push('');
  }
  if (opportunities.length) {
    md.push('## Opportunity Matrix');
    md.push('');
    md.push('| Classification | Surface | Opportunity |');
    md.push('|---|---|---|');
    for (const opportunity of opportunities) {
      md.push(`| ${opportunity.classification} | ${opportunity.surface} | ${opportunity.opportunity} |`);
    }
    md.push('');
  }
  md.push('## What This Report Does Not Claim');
  md.push('');
  for (const limitation of limitations) {
    md.push(`- ${limitation}`);
  }
  md.push('');
  md.push('## Evidence References');
  md.push('');
  for (const entry of scorecard.filter((item) => item.evidence_file)) {
    md.push(`- ${entry.surface}: \`${entry.evidence_file}\``);
  }
  md.push(`- Inspection Report: \`${path.join(executive.inspection_run_dir, 'inspection-report.json')}\``);
  md.push('');

  const outDir = path.join(resolvedRunDir, 'executive');
  const jsonPath = path.join(outDir, 'executive-report.json');
  const mdPath = path.join(outDir, 'executive-report.md');
  writeJson(jsonPath, executive);
  writeText(mdPath, `${md.join('\n')}\n`);

  return {
    inspection_id: report.inspection_id,
    json_path: path.relative(rootDir, jsonPath),
    md_path: path.relative(rootDir, mdPath),
    surfaces_scored: observedSurfaces.length,
    strengths: strengths.length,
    issues: issues.length,
    coverage_gaps: gaps.length
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node src/evaluator/generate-executive-report.mjs <inspection-run-dir>');
    process.exit(1);
  }
  const result = generateExecutiveReport(process.cwd(), runDir);
  console.log(JSON.stringify(result, null, 2));
}
