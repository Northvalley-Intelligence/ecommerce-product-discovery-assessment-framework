import fs from 'node:fs';

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readText(path) {
  if (!fs.existsSync(path)) {
    failures.push(`Missing file: ${path}`);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    failures.push(`Invalid JSON ${path}: ${error.message}`);
    return {};
  }
}

function includesAll(text, required, label) {
  const lower = text.toLowerCase();
  const missing = required.filter((item) => !lower.includes(item.toLowerCase()));
  assert(missing.length === 0, `${label} missing text: ${missing.join(', ')}`);
}

function excludesAll(text, disallowed, label) {
  const lower = text.toLowerCase();
  const present = disallowed.filter((item) => lower.includes(item.toLowerCase()));
  assert(present.length === 0, `${label} contains disallowed text: ${present.join(', ')}`);
}

const evidencePath = 'assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json';
const reportPath = 'assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.json';
const markdownPath = 'assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.md';
const latexPath = 'reports/highcountryoutfitters-combined-ecommerce-report.tex';
const pdfPath = 'highcountryoutfitters-combined-ecommerce-report.pdf';
const priorEvidencePath = 'assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json';
const handoffPath = '.mde/handoffs/control-center-highcountryoutfitters-owner-outreach-report-2026-07-03.md';
const refinementHandoffPath = '.mde/handoffs/control-center-highcountryoutfitters-same-query-competitor-refinement-2026-07-04.md';

const evidence = readJson(evidencePath);
const report = readJson(reportPath);
const priorEvidence = readJson(priorEvidencePath);
const markdown = readText(markdownPath);
const latex = readText(latexPath);
const structuredText = `${JSON.stringify(evidence)}\n${JSON.stringify(report)}\n${markdown}\n${latex}`;
const executiveMarkdown = markdown.split('\n## Concepts')[0] || markdown;
const executiveLatex = latex.split('\\newpage\n\\ReportPageHeader{Reference: Concepts}')[0] || latex;

assert(evidence.generation === 'GEN-011', 'expanded evidence must be GEN-011');
assert(report.generation === 'GEN-011', 'owner outreach report must be GEN-011');
assert(evidence.target?.domain === 'highcountryoutfitters.com', 'expanded evidence target must be highcountryoutfitters.com');
assert(report.target?.domain === 'highcountryoutfitters.com', 'owner report target must be highcountryoutfitters.com');
assert(evidence.summary?.total_examples === 175, 'expanded evidence must include 175 experiments');
assert(evidence.methodology?.examples_per_concept === 25, 'methodology must record 25 examples per concept');
assert(evidence.methodology?.concept_count === 7, 'methodology must record seven discovery concepts');
assert((evidence.examples || []).length === 175, 'full example dataset must contain exactly 175 rows');

const requiredConcepts = [
  'Normalization',
  'Tokenization',
  'Synonyms',
  'Ranking And Field Weighting',
  'Query Expansion',
  'Document Enrichment',
  'Spanish/Bilingual Discovery'
];
for (const concept of requiredConcepts) {
  const summary = (evidence.concepts || []).find((entry) => entry.concept === concept);
  const examples = (evidence.examples || []).filter((entry) => entry.concept === concept);
  assert(Boolean(summary), `concept summary missing: ${concept}`);
  assert(examples.length === 25, `${concept} must include 25 examples`);
  assert(summary?.example_count === 25, `${concept} summary must record 25 examples`);
  assert(typeof summary?.executive_explanation === 'string' && summary.executive_explanation.length > 20, `${concept} must include executive explanation`);
  assert(typeof summary?.why_it_matters === 'string' && summary.why_it_matters.length > 20, `${concept} must include why-it-matters explanation`);
}

assert(evidence.summary?.search_average === 94, 'search average should be the final expanded-evidence readout');
assert(evidence.summary?.autocomplete_average === 45, 'autocomplete average should be the final expanded-evidence readout');
assert(evidence.summary?.uniform_experience_rate === 43, 'uniform experience rate should be recorded');
assert(evidence.summary?.search_strong_autocomplete_weak_count === 92, 'strong-search/weak-autocomplete gap count should be recorded');
assert(evidence.summary?.spanish_bilingual_autocomplete_average === 0, 'Spanish/bilingual autocomplete average should expose the full gap');
assert(evidence.summary?.spanish_bilingual_uniform_rate === 0, 'Spanish/bilingual uniformity should expose the full gap');
assert(evidence.opportunity_model?.conservative_sitewide_sales_upside_range === '1% to 4%', 'conservative upside range must be directional and recorded');
assert(evidence.opportunity_model?.stretch_sitewide_sales_upside_range === '3% to 7%', 'stretch upside range must be directional and recorded');

for (const query of [
  'camp chairs',
  'trail running shirt',
  'waterproof breathable jacket',
  'hiking outfit women',
  'chaqueta lluvia mujer',
  'botas senderismo',
  'tenis hoka mujer',
  'regalo camping'
]) {
  assert((evidence.examples || []).some((entry) => entry.query === query), `expanded example dataset missing query: ${query}`);
}

assert(evidence.summary?.search_strong_autocomplete_weak_count >= 90, 'dataset should preserve the recorded autocomplete gap where search works but suggest is weak');
const spanishExamples = (evidence.examples || []).filter((entry) => entry.concept === 'Spanish/Bilingual Discovery');
assert(spanishExamples.length === 25, 'Spanish/bilingual concept must include 25 examples');
assert(spanishExamples.every((entry) => entry.autocomplete_score === 0), 'Spanish/bilingual autocomplete examples should all have no suggest assistance in this run');

const competitorEvidence = evidence.competitor_evidence || {};
const competitors = competitorEvidence.competitors || [];
const usableCompetitors = competitors.filter((competitor) => competitor.usable_run_count >= 8);
const visibleCompetitorNames = usableCompetitors.map((competitor) => competitor.name);
assert(competitors.length >= 3, 'competitor evidence must include at least three attempted outdoor-retail benchmarks');
assert(usableCompetitors.length >= 2, 'competitor evidence must include at least two usable competitor benchmarks');
assert(usableCompetitors.some((competitor) => competitor.name === 'Half-Moon Outfitters'), 'Half-Moon Outfitters usable competitor evidence must be present');
assert(usableCompetitors.some((competitor) => competitor.name === 'Mast General Store'), 'Mast General Store usable competitor evidence must be present');
assert(competitors.some((competitor) => competitor.name === 'Public Lands' && competitor.usable_run_count === 0 && (competitor.runs || []).every((run) => run.status === 403)), 'Public Lands blocked benchmark limit must be documented');
assert((competitorEvidence.summary?.interpretation || '').includes('not proof'), 'competitor summary must preserve paid-placement evidence limitation');
assert(competitors.every((competitor) => (competitor.sponsored_interpretation || '').includes('paid-placement')), 'competitor interpretations must use paid-placement language');

const competitorQueryBenchmark = evidence.competitor_query_benchmark || {};
const benchmarkSites = competitorQueryBenchmark.sites || [];
assert(benchmarkSites.length >= 2, 'same-query competitor benchmark must include at least two usable competitor sites');
for (const siteName of ['Half-Moon Outfitters', 'Mast General Store']) {
  const site = benchmarkSites.find((entry) => entry.name === siteName);
  assert(Boolean(site), `same-query competitor benchmark missing site: ${siteName}`);
  assert(site?.query_count === 175, `${siteName} same-query benchmark must run all 175 protected examples`);
  assert(site?.usable_search_count === 175, `${siteName} same-query benchmark must have 175 usable rendered search rows`);
  assert(site?.autocomplete_available_count === 175, `${siteName} same-query benchmark must have 175 public suggest rows`);
  assert((site?.runs || []).length === 175, `${siteName} same-query benchmark must preserve all individual rows`);
  assert((site?.concept_summaries || []).length === 7, `${siteName} same-query benchmark must summarize all seven query concepts`);
  for (const concept of requiredConcepts) {
    const summary = (site?.concept_summaries || []).find((entry) => entry.concept === concept);
    const runs = (site?.runs || []).filter((entry) => entry.concept === concept);
    assert(summary?.query_count === 25, `${siteName} same-query concept summary must include 25 rows for ${concept}`);
    assert(runs.length === 25, `${siteName} same-query rows missing for ${concept}`);
  }
}
const halfMoonBenchmark = benchmarkSites.find((entry) => entry.name === 'Half-Moon Outfitters') || {};
const mastBenchmark = benchmarkSites.find((entry) => entry.name === 'Mast General Store') || {};
assert(halfMoonBenchmark.search_average === 99 && halfMoonBenchmark.autocomplete_average === 38, 'Half-Moon same-query benchmark summary should match the repaired capture');
assert(mastBenchmark.search_average === 84 && mastBenchmark.autocomplete_average === 37, 'Mast same-query benchmark summary should match the repaired capture');

const executiveCompetitorSummary = report.executive_positioning?.competitor_win_loss_summary || {};
assert(executiveCompetitorSummary.status === 'comparable_public_evidence_available', 'executive report JSON must include grounded comparable-retailer context');
assert(executiveCompetitorSummary.search?.high_country === 94, 'peer context search summary must preserve High Country search average for reference tables');
assert(executiveCompetitorSummary.search?.half_moon === 99, 'peer context search summary must preserve Half-Moon search average for reference tables');
assert(executiveCompetitorSummary.search?.mast === 84, 'peer context search summary must preserve Mast search average for reference tables');
assert(executiveCompetitorSummary.autocomplete?.high_country === 45, 'peer context autocomplete summary must preserve High Country autocomplete average for reference tables');
assert(executiveCompetitorSummary.autocomplete?.half_moon === 38, 'peer context autocomplete summary must preserve Half-Moon autocomplete average for reference tables');
assert(executiveCompetitorSummary.autocomplete?.mast === 37, 'peer context autocomplete summary must preserve Mast autocomplete average for reference tables');

assert(priorEvidence.upstream_local_assessment?.excluded_sections?.some((entry) => entry.section === 'demandSatisfaction'), 'prior local assessment demand fit must remain excluded');
assert(priorEvidence.upstream_local_assessment?.excluded_sections?.some((entry) => entry.section === 'competitorComparison'), 'prior local assessment competitor comparison must remain excluded');
assert((priorEvidence.autocomplete_followups || []).some((entry) => entry.query === 'camp' && entry.api_matches_user_observation === true), 'prior camp autocomplete API follow-up must remain available');

includesAll(markdown, [
  'Online Customer Experience Opportunity Report',
  'already provides a strong online shopping experience',
  'exact measurements remain in the reference tables',
  'Estimated Upside',
  'Why This Matters',
  'High Country was selected because mature retailers with strong ecommerce foundations often benefit most from targeted, incremental improvements',
  'Executive question',
  'Customer-experience answer',
  'Why High Country?',
  'What can improve?',
  'How should value be measured?',
  'reduce customer effort',
  'confidence',
  'Same-Query Competitor Benchmark',
  'Full Competitor Same-Query Dataset',
  'Competitor Paid-Placement Reference',
  'Paid-placement labels visible',
  'Unusable competitor capture attempts are retained in the structured evidence artifact but excluded from the comparison table',
  'Full Experiment Dataset',
  'Spanish/Bilingual Discovery',
  'Half-Moon Outfitters',
  'Mast General Store'
], 'owner markdown report');

includesAll(latex, [
  'northvalley-template-assets/northvalley-brand.sty',
  'High Country Outfitters Online Customer Experience Opportunity',
  'Executive Readout',
  'Customer Buying Experience Opportunity',
  'strong regional outdoor retail ecommerce experience',
  'High Country was selected because it already has a strong ecommerce foundation',
  'Why This Matters',
  'Executive question',
  'Customer-experience answer',
  'Why High Country?',
  'What can improve?',
  'How should value be measured?',
  'Customers already have a strong shopping foundation',
  'Customers can receive clearer guidance earlier',
  'customer effort',
  'making it easier for customers to find and buy products online',
  'Use customer journey data, add-to-cart rate, conversion, and order value to estimate impact',
  'Recommended Growth Path',
  'Customer Effort Reduction Model',
  'Customer works harder',
  'First 90 days: reduce early effort',
  'Limited early guidance',
  'Extra refinements',
  'Business Value Lens',
  '90-Day Opportunity Roadmap',
  'Executive Decision Focus',
  'Reference A: Executive-Level IR Concepts',
  'Reference D: Full Query Dataset',
  'Reference E: Same-Query Competitor Benchmark',
  'Reference F: Full Competitor Same-Query Dataset',
  'Reference G: Competitor Organic And Paid-Placement Checks',
  'Unusable public captures are retained in the structured evidence artifact and excluded from this table',
  'Reference H: Prior Ecommerce And Local-Site Evidence',
  'The following table contains all 175 public search/autocomplete experiments',
  'Spanish/Bilingual Discovery',
  'No visible paid-placement labels',
  'Half-Moon Outfitters',
  'Mast General Store',
  'Recommended Follow-Up'
], 'Northvalley owner PDF source');

for (const name of visibleCompetitorNames) {
  assert(latex.includes(name), `Visible competitor missing from PDF source: ${name}`);
}
assert(!latex.includes('Public Lands'), 'Blocked Public Lands capture must not appear as evaluated competitor evidence in PDF source');

excludesAll(structuredText, [
  'What Should Make The Owner Care',
  'What I Would Tell The Owner',
  'Owner Outreach Report',
  'owner-facing',
  'owner can',
  'Article 5',
  'Article 6',
  'Article 7',
  'Article 8',
  'Article 9',
  'Article 10',
  'scorecard',
  'First Improvements',
  'Hispanic',
  'sponsored/promoted',
  'Competitor And Organic Visibility Opportunity',
  'Paid-Placement Versus Organic Readout'
], 'owner report artifacts');

excludesAll(`${JSON.stringify(report.executive_positioning)}\n${executiveMarkdown}\n${executiveLatex}`, [
  'trails Half-Moon',
  'not the top performer',
  'leads Mast General Store overall',
  'High Country leads both regional benchmarks overall',
  'Autocomplete averaged 45%',
  'Rendered search average & 94',
  'Public suggest/autocomplete average & 45',
  '1--4\\% sitewide ecommerce sales upside',
  '3--7\\%',
  'Tokenization',
  'Synonyms',
  'Ranking',
  'Query Expansion',
  'autocomplete dictionaries',
  'search/browse/autocomplete',
  'search and browse foundation',
  'pre-search guidance',
  'presses Enter'
], 'executive narrative');

assert(fs.existsSync(pdfPath), 'compiled Northvalley PDF must exist');
assert(fs.statSync(pdfPath).size > 500000, 'compiled Northvalley PDF should be non-trivial in size');
assert(fs.existsSync(handoffPath), 'owner outreach handoff must exist');
assert(fs.existsSync(refinementHandoffPath), 'same-query competitor refinement handoff must exist');

if (failures.length) {
  console.error('High Country owner outreach report validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('High Country owner outreach report validation passed');
console.log(`Examples checked: ${evidence.examples.length}`);
console.log(`Concepts checked: ${requiredConcepts.length}`);
console.log(`Usable competitors checked: ${usableCompetitors.map((competitor) => competitor.name).join(', ')}`);
