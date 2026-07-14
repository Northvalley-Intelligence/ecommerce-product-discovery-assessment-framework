import fs from 'node:fs';

const requiredAreas = [
  'search',
  'autocomplete',
  'browse_navigation',
  'filters_facets',
  'recommendations_related_discovery',
  'mobile_experience',
  'journey_analysis'
];

const scoreDimensions = [
  'precision',
  'recall',
  'ranking_quality',
  'diversity',
  'query_understanding',
  'robustness',
  'coverage',
  'recovery',
  'user_effort'
];

const scorecardCategories = [
  'search',
  'autocomplete',
  'browse',
  'filters',
  'recommendations',
  'mobile_experience',
  'product_discovery_overall'
];

const findingFields = [
  'observation',
  'evidence',
  'severity',
  'customer_impact',
  'business_impact',
  'recommendation'
];

const failures = [];
const warnings = [];

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
    failures.push(`Invalid JSON in ${path}: ${error.message}`);
    return {};
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(actual, required, label) {
  const actualSet = new Set(actual || []);
  const missing = required.filter((item) => !actualSet.has(item));
  assert(missing.length === 0, `${label} missing: ${missing.join(', ')}`);
}

function textIncludesAll(text, required, label) {
  const lower = text.toLowerCase();
  const missing = required.filter((item) => !lower.includes(item.toLowerCase()));
  assert(missing.length === 0, `${label} missing text: ${missing.join(', ')}`);
}

function textExcludesAll(text, disallowed, label) {
  const lower = text.toLowerCase();
  const present = disallowed.filter((item) => lower.includes(item.toLowerCase()));
  assert(present.length === 0, `${label} contains disallowed text: ${present.join(', ')}`);
}

function renderedSearchCount(evidence, query) {
  const page = (evidence.rendered?.search_pages || []).find((entry) => {
    const haystack = `${entry.label || ''} ${entry.title || ''} ${entry.url || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const match = page?.title?.match(/Search:\s*([\d,]+)\s+results found/i);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function validateAssessmentDoc(doc, path, options = {}) {
  assert(doc.assessment_id, `${path} missing assessment_id`);
  assert(doc.framework_version === '0.1.0', `${path} must use framework_version 0.1.0`);
  assert(doc.target && doc.target.company_name, `${path} missing target.company_name`);
  includesAll((doc.assessment_areas || []).map((area) => area.area_id), requiredAreas, `${path} assessment_areas`);
  includesAll(Object.keys(doc.scorecard || {}), scorecardCategories, `${path} scorecard`);
  for (const area of doc.assessment_areas || []) {
    assert(Array.isArray(area.dimensions) && area.dimensions.length > 0, `${path} ${area.area_id} missing dimensions`);
    assert(Array.isArray(area.journeys_or_checks) && area.journeys_or_checks.length > 0, `${path} ${area.area_id} missing journeys_or_checks`);
    assert(typeof area.notes === 'string', `${path} ${area.area_id} missing notes`);
  }
  for (const [category, score] of Object.entries(doc.scorecard || {})) {
    assert(Object.prototype.hasOwnProperty.call(score, 'score'), `${path} ${category} score missing score value`);
    assert(typeof score.rationale === 'string' && score.rationale.length > 0, `${path} ${category} missing rationale`);
    assert(Array.isArray(score.evidence_refs), `${path} ${category} evidence_refs must be an array`);
  }
  for (const finding of doc.findings || []) {
    for (const field of findingFields) {
      assert(Object.prototype.hasOwnProperty.call(finding, field), `${path} finding ${finding.id || '<unknown>'} missing ${field}`);
    }
    if (options.requireEvidenceBackedFindings) {
      assert(Array.isArray(finding.evidence) && finding.evidence.length > 0, `${path} finding ${finding.id || '<unknown>'} missing evidence entries`);
      assert(typeof finding.customer_impact === 'string' && finding.customer_impact.length > 0, `${path} finding ${finding.id || '<unknown>'} missing customer impact detail`);
      assert(typeof finding.business_impact === 'string' && finding.business_impact.length > 0, `${path} finding ${finding.id || '<unknown>'} missing business impact detail`);
      assert(typeof finding.recommendation === 'string' && finding.recommendation.length > 0, `${path} finding ${finding.id || '<unknown>'} missing recommendation detail`);
    }
  }
  if (options.requireEvidenceBackedFindings) {
    assert((doc.findings || []).length >= 3, `${path} should contain at least three public-retail findings`);
    assert(Array.isArray(doc.access_limitations) && doc.access_limitations.length > 0, `${path} must record public evidence limitations`);
  }
}

const requiredFiles = [
  'framework/assessment-rubric.json',
  'schemas/assessment.schema.json',
  'templates/assessment-template.json',
  'assessments/boxercraft/assessment.seed.json',
  'assessments/boxercraft/pilot-protocol.md',
  'assessments/boxercraft/public-retail-evaluation.json',
  'framework/coverage-matrix.json',
  'docs/framework/rubric.md',
  'docs/templates/executive-report.md',
  'reports/boxercraft-product-discovery-assessment.tex',
  'presentations/boxercraft-product-discovery-brief.tex',
  'assessments/boxercraft/browser-evidence/GEN-003/browser-validation.json',
  'assessments/boxercraft/normalization-evidence/GEN-004/normalization-evaluation.json',
  'assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.json',
  'assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.md',
  'assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.json',
  'assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.md',
  'scripts/evaluate-boxercraft-browse-node-parity.mjs',
  'assessments/boxercraft/local-school-opportunity/GEN-008/evidence-summary.json',
  'reports/boxercraft-local-school-pta-opportunity-report.tex',
  'boxercraft-local-school-pta-opportunity-report.pdf',
  'scripts/evaluate-highcountryoutfitters-ecommerce.mjs',
  'scripts/evaluate-highcountryoutfitters-ir-concepts.mjs',
  'scripts/evaluate-highcountryoutfitters-expanded-ir.mjs',
  'scripts/validate-highcountryoutfitters-report.mjs',
  'assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json',
  'assessments/high-country-outfitters/ir-concept-evidence/GEN-010/highcountryoutfitters-ir-concept-evidence.json',
  'assessments/high-country-outfitters/combined-report/GEN-010/highcountryoutfitters-combined-ecommerce-report.json',
  'assessments/high-country-outfitters/combined-report/GEN-010/highcountryoutfitters-combined-ecommerce-report.md',
  'assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json',
  'assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.json',
  'assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.md',
  'reports/highcountryoutfitters-combined-ecommerce-report.tex',
  'highcountryoutfitters-combined-ecommerce-report.pdf',
  '.mde/handoffs/control-center-highcountryoutfitters-combined-ecommerce-report-2026-07-02.md',
  '.mde/handoffs/control-center-highcountryoutfitters-owner-outreach-report-2026-07-03.md',
  '.mde/handoffs/control-center-highcountryoutfitters-same-query-competitor-refinement-2026-07-04.md',
  'deploy/release-checks.json',
  '.mde/generations/GEN-003.json',
  '.mde/generations/GEN-004.json',
  '.mde/generations/GEN-005.json',
  '.mde/generations/GEN-006.json',
  '.mde/generations/GEN-007.json',
  '.mde/generations/GEN-008.json',
  '.mde/generations/GEN-009.json',
  '.mde/generations/GEN-010.json',
  '.mde/generations/GEN-011.json',
  '.mde/validation-runs/VAL-005.json',
  '.mde/validation-runs/VAL-006.json',
  '.mde/validation-runs/VAL-007.json',
  '.mde/validation-runs/VAL-008.json',
  '.mde/validation-runs/VAL-009.json',
  '.mde/validation-runs/VAL-010.json',
  '.mde/validation-runs/VAL-011.json',
  '.mde/validation-runs/VAL-012.json',
  '.mde/validation-runs/VAL-017.json',
  '.mde/validation-runs/VAL-018.json',
  '.mde/validation-runs/VAL-019.json',
  '.mde/validation-runs/VAL-020.json',
  '.mde/validation-runs/VAL-021.json',
  '.mde/validation-runs/VAL-022.json',
  '.mde/validation-runs/VAL-023.json',
  '.mde/validation-runs/VAL-024.json',
  '.mde/validation-runs/VAL-025.json',
  '.mde/validation-runs/VAL-026.json',
  '.mde/validation-runs/VAL-027.json',
  '.mde/validation-runs/VAL-028.json',
  '.mde/validation-runs/VAL-029.json',
  '.mde/validation-runs/VAL-030.json',
  '.mde/validation-runs/VAL-031.json',
  '.mde/validation-runs/VAL-032.json',
  '.mde/validation-runs/VAL-033.json',
  '.mde/validation-runs/VAL-034.json',
  '.mde/validation-runs/VAL-035.json',
  '.mde/validation-runs/VAL-036.json',
  '.mde/validation-runs/VAL-037.json',
  '.mde/validation-runs/VAL-038.json',
  '.mde/validation-runs/VAL-039.json',
  '.mde/validation-runs/VAL-040.json',
  '.mde/validation-runs/VAL-041.json',
  '.mde/validation-runs/VAL-042.json',
  '.mde/validation-runs/VAL-043.json',
  '.mde/validation-runs/VAL-044.json',
  '.mde/validation-runs/VAL-045.json',
  '.mde/validation-runs/VAL-046.json'
];

for (const file of requiredFiles) {
  assert(fs.existsSync(file), `Required framework artifact missing: ${file}`);
}

const rubric = readJson('framework/assessment-rubric.json');
includesAll((rubric.assessment_areas || []).map((area) => area.id), requiredAreas, 'rubric assessment_areas');
includesAll((rubric.score_dimensions || []).map((dimension) => dimension.id), scoreDimensions, 'rubric score_dimensions');
includesAll((rubric.scorecard_categories || []).map((category) => category.id), scorecardCategories, 'rubric scorecard_categories');
includesAll(rubric.evidence_requirements?.every_finding_requires, findingFields, 'rubric finding requirements');

const searchArea = (rubric.assessment_areas || []).find((area) => area.id === 'search');
includesAll(searchArea?.required_query_types, [
  'exact_match',
  'partial_match',
  'multi_word_query',
  'attribute_query',
  'category_query',
  'brand_query',
  'product_identifier_query',
  'long_tail_query'
], 'search required_query_types');

const journeyArea = (rubric.assessment_areas || []).find((area) => area.id === 'journey_analysis');
includesAll(journeyArea?.required_journey_types, [
  'known_item',
  'attribute_discovery',
  'category_discovery',
  'sku_lookup',
  'unavailable_item_alternatives',
  'comparison',
  'large_catalog_navigation'
], 'journey required_journey_types');

const schema = readJson('schemas/assessment.schema.json');
includesAll(schema.required, [
  'assessment_id',
  'framework_version',
  'assessment_status',
  'target',
  'assessment_areas',
  'scorecard',
  'findings',
  'opportunity_matrix',
  'access_limitations'
], 'schema root requirements');
includesAll(schema.$defs?.finding?.required, [
  'observation',
  'evidence',
  'severity',
  'customer_impact',
  'business_impact',
  'recommendation',
  'opportunity_class',
  'confidence',
  'status'
], 'schema finding requirements');
includesAll(schema.properties?.scorecard?.required, scorecardCategories, 'schema scorecard categories');

validateAssessmentDoc(readJson('templates/assessment-template.json'), 'templates/assessment-template.json');
validateAssessmentDoc(readJson('assessments/boxercraft/assessment.seed.json'), 'assessments/boxercraft/assessment.seed.json');
validateAssessmentDoc(readJson('assessments/boxercraft/public-retail-evaluation.json'), 'assessments/boxercraft/public-retail-evaluation.json', {
  requireEvidenceBackedFindings: true
});

const protocol = readText('assessments/boxercraft/pilot-protocol.md');
textIncludesAll(protocol, [
  'public consumer',
  'authenticated wholesale',
  'Do not overfit',
  'Search Evaluation',
  'Autocomplete Evaluation',
  'Browse Navigation Evaluation',
  'Filters And Facets Evaluation',
  'Recommendations And Related Discovery',
  'Mobile Experience',
  'Journey Analysis',
  'maroon quarter zip',
  "women's fleece",
  'Georgia Bulldogs apparel',
  'SKU',
  'unavailable item',
  'Observation',
  'Evidence',
  'Severity',
  'Customer impact',
  'Business impact',
  'Recommendation'
], 'Boxercraft pilot protocol');

const report = readText('docs/templates/executive-report.md');
textIncludesAll(report, [
  'Executive Summary',
  'Key Findings',
  'Major Strengths',
  'Major Weaknesses',
  'Revenue-Impacting Opportunities',
  'Recommended Next Steps',
  'Product Discovery Scorecard',
  'Opportunity Matrix',
  'Detailed Findings',
  'Assessment Coverage',
  'Access And Evidence Limitations'
], 'executive report template');

const boxercraftReport = readText('reports/boxercraft-product-discovery-assessment.tex');
textIncludesAll(boxercraftReport, [
  'Boxercraft Product Discovery Assessment',
  'Rendered public-retail, public-wholesale, 36-query search/autocomplete normalization, all-node browse parity, and competitor discovery benchmark',
  'Executive Summary',
  'Evidence Snapshot',
  'Browse Node Parity',
  'All Browse Nodes Compared To Search And Autocomplete',
  'Only 5/60 category or fan-shop nodes',
  'Lambert Soccer Everest Blanket',
  'Competitor Benchmark',
  'Search, Autocomplete, And Browse Comparison',
  'Normalization Matrix',
  'UCLA/Bruins',
  'Search And Autocomplete To Browse',
  'Search and autocomplete normalization',
  'GEN-007 all-node browse parity evidence',
  'Boxercraft leads the tested competitor discovery benchmark',
  'Boxercraft scored 78 versus Colosseum 55 and L2 Brands 46',
  'Colosseum Athletics',
  'Concepts Sport',
  'Fanatics',
  'Georgia Bulldogs',
  'Product-page recommendations',
  'Recommended Improvements',
  'Before Client Delivery',
  'Evidence URLs'
], 'Boxercraft report source');

const boxercraftDeck = readText('presentations/boxercraft-product-discovery-brief.tex');
textIncludesAll(boxercraftDeck, [
  'Boxercraft Product Discovery Brief',
  'Rendered public-retail, public-wholesale, and search/autocomplete normalization',
  'Bottom Line',
  'Evidence Scope',
  'Normalization Matrix',
  'UCLA / Team Discovery',
  'Search And Autocomplete To Browse',
  'Next Validation Pass'
], 'Boxercraft presentation source');

const localSchoolReport = readText('reports/boxercraft-local-school-pta-opportunity-report.tex');
textIncludesAll(localSchoolReport, [
  'Why Nearby School Buyers May Not Choose Boxercraft',
  'Local School Buyer Diagnosis',
  'A nearby school T-shirt need brought the evaluator to Boxercraft',
  'That was not the conclusion; it was the entry point',
  'Follow-up checks in search, autocomplete, and browse',
  'elementary-school browse category',
  'Lambert-related',
  'did not return matching products through search or autocomplete',
  'Problem Chain',
  'What Is Working But Not Solving This',
  'Problems Found After The Initial Hook',
  'Likely Buyer Interpretation',
  'The site does not fail because a single page is missing',
  'Clipboard benchmark was partial, medium confidence'
], 'local school PTA opportunity report source');
for (const disallowedText of [
  '100/100',
  '75/100',
  '67/100',
  '58/100',
  '48/100',
  '42/100',
  '25/100',
  '20/100',
  '14/100',
  '5/60',
  'Priority Moves',
  '90-Day Roadmap',
  'Positioning To Test',
  'Recommended Executive Actions',
  'Local school spiritwear, made easy'
]) {
  assert(!localSchoolReport.includes(disallowedText), `local school PTA report must omit score/proposal text: ${disallowedText}`);
}

const browserValidation = readJson('assessments/boxercraft/browser-evidence/GEN-003/browser-validation.json');
assert(browserValidation.generation_id === 'GEN-003', 'browser validation must be recorded for GEN-003');
assert(Array.isArray(browserValidation.failures) && browserValidation.failures.length === 0, 'browser validation must have no failures');
assert(Array.isArray(browserValidation.findings) && browserValidation.findings.length >= 5, 'browser validation must include rendered findings and positive signals');
assert((browserValidation.validations?.autocomplete || []).some((item) => item.query === 'maroon quarter zip' && item.nothing_found), 'browser validation must capture maroon quarter zip autocomplete gap');
assert((browserValidation.validations?.search_pages || []).some((item) => item.query === 'maroon quarter zip' && item.result_count >= 1), 'browser validation must capture maroon quarter zip search results');
assert(browserValidation.validations?.product_recommendations?.section_present, 'browser validation must capture product recommendations section');
assert(browserValidation.validations?.mobile_home?.exposes_search, 'browser validation must capture mobile search exposure');
assert((browserValidation.validations?.wholesale_public?.searches || []).some((item) => item.query === 'BM5205' && item.result_count === 1), 'browser validation must capture public wholesale SKU lookup');
for (const finding of browserValidation.findings || []) {
  for (const evidencePath of finding.evidence || []) {
    assert(fs.existsSync(evidencePath), `Browser finding evidence missing: ${evidencePath}`);
  }
}

const normalizationValidation = readJson('assessments/boxercraft/normalization-evidence/GEN-004/normalization-evaluation.json');
assert(normalizationValidation.generation_id === 'GEN-004', 'normalization validation must be recorded for GEN-004');
assert(Array.isArray(normalizationValidation.failures) && normalizationValidation.failures.length === 0, 'normalization validation must have no failures');
assert(Array.isArray(normalizationValidation.groups) && normalizationValidation.groups.length === 6, 'normalization validation must include six query groups');
assert(Array.isArray(normalizationValidation.summaries) && normalizationValidation.summaries.length === 6, 'normalization validation must include six group summaries');
const summariesByGroup = new Map((normalizationValidation.summaries || []).map((item) => [item.group_id, item]));
for (const requiredSummary of [
  'quarter_zip_spacing_abbreviation',
  'womens_fleece_possessive',
  'ucla_bruins_priority',
  'team_fan_shop_aliases',
  'color_product_terms',
  'public_wholesale_sku_variants'
]) {
  assert(summariesByGroup.has(requiredSummary), `normalization summary missing: ${requiredSummary}`);
}
const uclaSummary = summariesByGroup.get('ucla_bruins_priority') || {};
const colorSummary = summariesByGroup.get('color_product_terms') || {};
const quarterSummary = summariesByGroup.get('quarter_zip_spacing_abbreviation') || {};
const wholesaleSummary = summariesByGroup.get('public_wholesale_sku_variants') || {};
assert(uclaSummary.search_relevant_count >= 6, 'UCLA/Bruins priority terms must remain mostly recoverable in search');
assert(uclaSummary.autocomplete_relevant_count >= 5, 'UCLA/Bruins priority terms must remain mostly recoverable in autocomplete');
assert(colorSummary.autocomplete_relevant_count === 0, 'color-plus-product autocomplete gap must remain explicitly captured');
assert(quarterSummary.zero_search_queries?.includes('quarterzip'), 'quarterzip zero-search result must be captured in GEN-004 evidence');
assert(wholesaleSummary.search_relevant_count >= 4, 'public wholesale SKU/product-code variants must capture at least four relevant variants');
assert((normalizationValidation.findings || []).some((item) => item.category === 'Search And Autocomplete To Browse'), 'normalization validation must include Search And Autocomplete To Browse finding');
for (const group of normalizationValidation.groups || []) {
  for (const evaluation of group.evaluations || []) {
    for (const evidencePath of [
      evaluation.search?.screenshot,
      evaluation.autocomplete?.screenshot
    ].filter(Boolean)) {
      assert(fs.existsSync(evidencePath), `Normalization screenshot missing: ${evidencePath}`);
    }
  }
}

const competitorValidation = readJson('assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.json');
assert(competitorValidation.generation_id === 'GEN-006', 'competitor validation must be recorded for GEN-006');
assert(Array.isArray(competitorValidation.failures) && competitorValidation.failures.length === 0, 'competitor validation must have no failures');
assert(Array.isArray(competitorValidation.sites) && competitorValidation.sites.length >= 5, 'competitor validation must include Boxercraft plus competitor sites');
assert(Array.isArray(competitorValidation.discovery_queries) && competitorValidation.discovery_queries.length >= 8, 'competitor validation must include the common discovery query set');
assert(Array.isArray(competitorValidation.findings) && competitorValidation.findings.length >= 3, 'competitor validation must include pricing and discovery findings');
const competitorSites = new Map((competitorValidation.sites || []).map((site) => [site.id, site]));
for (const requiredSite of ['boxercraft', 'l2brands', 'colosseum', 'concepts_sport', 'fanatics']) {
  assert(competitorSites.has(requiredSite), `competitor validation missing site: ${requiredSite}`);
}
assert((competitorSites.get('boxercraft')?.catalog?.product_count || 0) >= 100, 'Boxercraft competitor benchmark must capture the public product catalog');
assert((competitorSites.get('l2brands')?.catalog?.product_count || 0) >= 100, 'L2 Brands competitor benchmark must capture the public product catalog');
assert((competitorSites.get('colosseum')?.catalog?.product_count || 0) >= 100, 'Colosseum competitor benchmark must capture the public product catalog');
const boxercraftFlannel = (competitorSites.get('boxercraft')?.price_benchmark?.categories || []).find((item) => item.category_id === 'flannel_pants') || {};
const l2Flannel = (competitorSites.get('l2brands')?.price_benchmark?.categories || []).find((item) => item.category_id === 'flannel_pants') || {};
const colosseumFlannel = (competitorSites.get('colosseum')?.price_benchmark?.categories || []).find((item) => item.category_id === 'flannel_pants') || {};
assert(boxercraftFlannel.product_count >= 5, 'competitor benchmark must capture Boxercraft flannel-pant assortment');
assert(Number.isFinite(boxercraftFlannel.min_price) && Number.isFinite(boxercraftFlannel.max_price), 'Boxercraft flannel-pant price range must be priced');
assert(l2Flannel.product_count === 0, 'competitor benchmark must explicitly capture that L2 public catalog has no flannel-pant matches');
assert(colosseumFlannel.product_count === 0, 'competitor benchmark must explicitly capture that Colosseum public catalog has no flannel-pant matches');
assert((competitorSites.get('boxercraft')?.discovery_tests || []).length >= 8, 'Boxercraft competitor benchmark must include discovery tests');
assert((competitorSites.get('l2brands')?.discovery_tests || []).length >= 8, 'L2 competitor benchmark must include discovery tests');
assert((competitorSites.get('colosseum')?.discovery_tests || []).length >= 8, 'Colosseum competitor benchmark must include discovery tests');
assert((competitorValidation.findings || []).some((item) => item.category === 'Assortment And Price Benchmark'), 'competitor validation must include flannel-pants assortment/price finding');
const competitorSummary = readText('assessments/boxercraft/competitor-evidence/GEN-006/competitor-pricing-discovery.md');
textIncludesAll(competitorSummary, [
  'Boxercraft Competitor Pricing And Discovery Benchmark',
  'Price Ranges',
  'Discovery Performance',
  'Flannel pants',
  'UCLA/Bruins commercial importance remains stakeholder context',
  'Fanatics was treated as a marketplace benchmark'
], 'competitor benchmark summary');
for (const site of competitorValidation.sites || []) {
  const screenshots = [
    site.browse_validation?.screenshot,
    ...(site.discovery_tests || []).flatMap((test) => [
      test.search?.screenshot,
      test.autocomplete?.screenshot
    ])
  ].filter(Boolean);
  for (const evidencePath of screenshots) {
    assert(fs.existsSync(evidencePath), `Competitor screenshot missing: ${evidencePath}`);
  }
}

const browseParityValidation = readJson('assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.json');
assert(browseParityValidation.generation_id === 'GEN-007', 'browse-node parity validation must be recorded for GEN-007');
assert(Array.isArray(browseParityValidation.failures) && browseParityValidation.failures.length === 0, 'browse-node parity validation must have no failures');
assert(Array.isArray(browseParityValidation.warnings) && browseParityValidation.warnings.length === 0, 'browse-node parity validation must have no warnings in the final evidence run');
assert((browseParityValidation.nodes || []).filter((node) => node.status === 'error').length === 0, 'browse-node parity validation must have no node errors');
assert(browseParityValidation.summary?.public_collections_discovered === 96, 'browse-node parity validation must enumerate all 96 public collections captured in GEN-007');
assert(browseParityValidation.summary?.evaluated_nodes === 93, 'browse-node parity validation must evaluate 93 non-empty public browse nodes');
assert(browseParityValidation.summary?.core_nodes_evaluated === 60, 'browse-node parity validation must score 60 category or fan-shop nodes');
assert(browseParityValidation.summary?.core_nodes_with_exact_search_browse_match === 5, 'browse-node parity validation must preserve the 5/60 exact search/browse parity result');
assert(browseParityValidation.summary?.core_nodes_with_search_only_products === 13, 'browse-node parity validation must capture 13 core nodes with search-only products');
assert(browseParityValidation.summary?.core_nodes_with_browse_only_products === 51, 'browse-node parity validation must capture 51 core nodes with browse-only products');
assert(browseParityValidation.summary?.core_nodes_with_no_autocomplete_browse_hit === 47, 'browse-node parity validation must capture 47 core nodes with no autocomplete browse-product hit');
const blanketsNode = (browseParityValidation.nodes || []).find((node) => node.handle === 'blankets') || {};
assert(blanketsNode.browse_product_count === 2, 'blankets browse node must capture 2 browsed products');
assert(blanketsNode.search_total_product === 3, 'blankets search must capture 3 products');
assert(blanketsNode.autocomplete_total_product === 3, 'blankets autocomplete must report 3 total products');
assert((blanketsNode.comparison?.search_only_products || []).some((product) => product.title === 'Lambert Soccer Everest Blanket'), 'blankets parity finding must include Lambert Soccer Everest Blanket as search-only');
const browseParitySummary = readText('assessments/boxercraft/browse-node-parity/GEN-007/browse-node-parity.md');
textIncludesAll(browseParitySummary, [
  'Boxercraft Browse Node Parity Evaluation',
  'Exact search/browse product-set parity on core nodes: 5/60',
  'The Blankets node used query `blankets`',
  'Lambert Soccer Everest Blanket'
], 'browse-node parity summary');

const localSchoolOpportunity = readJson('assessments/boxercraft/local-school-opportunity/GEN-008/evidence-summary.json');
assert(localSchoolOpportunity.generation_id === 'GEN-008', 'local school opportunity evidence must be recorded for GEN-008');
assert(localSchoolOpportunity.report_id === 'boxercraft-local-school-pta-opportunity', 'local school opportunity evidence must identify the report');
assert(localSchoolOpportunity.website_benchmark_from_clipboard?.confidence === 'medium', 'local school opportunity evidence must preserve clipboard confidence');
const websiteScores = new Map((localSchoolOpportunity.website_benchmark_from_clipboard?.scores || []).map((score) => [score.category, score]));
assert(websiteScores.get('Local Visibility')?.subject_score === 20, 'local school evidence must capture Local Visibility 20/100');
assert(websiteScores.get('Lead Conversion')?.subject_score === 100, 'local school evidence must capture Lead Conversion 100/100');
assert(websiteScores.get('Message Clarity')?.subject_score === 0, 'local school evidence must capture Message Clarity 0/100');
assert(websiteScores.get('Mobile Experience')?.subject_score === 100, 'local school evidence must capture Mobile Experience 100/100');
assert(localSchoolOpportunity.ecommerce_discovery_evidence?.browse_parity?.exact_search_browse_parity === '5/60', 'local school evidence must include 5/60 browse parity signal');
assert((localSchoolOpportunity.ecommerce_discovery_evidence?.school_browse_evidence || []).some((node) => node.title === 'Lambert High School Spiritwear' && node.search_total_product === 0), 'local school evidence must capture Lambert school browse/search gap');
assert(localSchoolOpportunity.executive_readout?.includes('local school buyer'), 'local school evidence must include executive readout');

const highCountryEvidence = readJson('assessments/high-country-outfitters/ecommerce-evidence/GEN-010/highcountryoutfitters-ecommerce-evidence.json');
const highCountryIrEvidence = readJson('assessments/high-country-outfitters/ir-concept-evidence/GEN-010/highcountryoutfitters-ir-concept-evidence.json');
const highCountryReport = readJson('assessments/high-country-outfitters/combined-report/GEN-010/highcountryoutfitters-combined-ecommerce-report.json');
const highCountryOwnerEvidence = readJson('assessments/high-country-outfitters/expanded-ir-evidence/GEN-011/highcountryoutfitters-expanded-ir-evidence.json');
const highCountryOwnerReport = readJson('assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.json');
const highCountryOwnerMarkdown = readText('assessments/high-country-outfitters/owner-outreach-report/GEN-011/highcountryoutfitters-owner-outreach-report.md');
const highCountryLatex = readText('reports/highcountryoutfitters-combined-ecommerce-report.tex');
const highCountryExecutiveMarkdown = highCountryOwnerMarkdown.split('\n## Concepts')[0] || highCountryOwnerMarkdown;
const highCountryExecutiveLatex = highCountryLatex.split('\\newpage\n\\ReportPageHeader{Reference: Concepts}')[0] || highCountryLatex;
assert(highCountryEvidence.project_id === 'ecommmerce-eval', 'High Country evidence must use canonical project id');
assert(highCountryReport.project_id === 'ecommmerce-eval', 'High Country report must use canonical project id');
assert(highCountryReport.generation === 'GEN-010', 'High Country report must be recorded for GEN-010');
assert(highCountryEvidence.target?.domain === 'highcountryoutfitters.com', 'High Country evidence must target highcountryoutfitters.com');
assert(highCountryOwnerEvidence.generation === 'GEN-011', 'High Country owner evidence must be recorded for GEN-011');
assert(highCountryOwnerReport.generation === 'GEN-011', 'High Country owner report must be recorded for GEN-011');
assert(highCountryOwnerEvidence.target?.domain === 'highcountryoutfitters.com', 'High Country owner evidence must target highcountryoutfitters.com');
assert((highCountryEvidence.search_queries || []).length >= 12, 'High Country evidence must include the corrected 12-query search set');
assert((highCountryEvidence.search_queries || []).some((entry) => entry.query === 'patagonia' && ((entry.result_count || 0) > 0 || (entry.suggest?.products || []).length > 0)), 'High Country evidence must capture Patagonia search/suggest evidence');
assert((highCountryEvidence.search_queries || []).some((entry) => entry.query === 'camp chair'), 'High Country evidence must include camp chair query');
assert((highCountryEvidence.search_queries || []).some((entry) => entry.query === 'camp chairs'), 'High Country evidence must include camp chairs follow-up query');
assert(renderedSearchCount(highCountryEvidence, 'camp chair') === 183, 'High Country evidence must capture 183 rendered camp chair results');
assert(renderedSearchCount(highCountryEvidence, 'camp chairs') === 184, 'High Country evidence must capture 184 rendered camp chairs results');
const highCountryCampAutocomplete = (highCountryEvidence.autocomplete_followups || []).find((entry) => entry.query === 'camp');
assert(highCountryCampAutocomplete?.api_matches_user_observation === true, 'High Country evidence must record camp autocomplete API/UI match');
assert((highCountryCampAutocomplete?.queries || []).includes('camp chairs'), 'High Country camp autocomplete must include camp chairs query suggestion');
assert((highCountryCampAutocomplete?.collections || []).some((entry) => entry.title === 'Camp Kitchen'), 'High Country camp autocomplete must include Camp Kitchen collection suggestion');
assert(highCountryEvidence.ir_concept_tests?.example_count >= 12, 'High Country evidence must include at least 12 apparel IR concept examples');
assert(highCountryIrEvidence.example_count >= 12, 'High Country standalone IR evidence must include at least 12 apparel IR concept examples');
assert(highCountryIrEvidence.search_example_count >= 10, 'High Country IR evidence must include at least 10 scored search examples');
assert(highCountryIrEvidence.autocomplete_example_count >= 10, 'High Country IR evidence must include at least 10 scored autocomplete examples');
for (const concept of ['Normalization', 'Tokenization', 'Synonyms', 'Field Weighting', 'Query Expansion', 'Document Enrichment']) {
  assert((highCountryIrEvidence.concepts || []).some((entry) => entry.concept === concept), `High Country IR evidence must include concept: ${concept}`);
}
for (const query of ['womens rain jacket', '1/4 zip pullover', 'puffer jacket', 'vuori joggers women', 'trail running shirt', 'UPF shirt women']) {
  assert((highCountryIrEvidence.examples || []).some((entry) => entry.query === query && Number.isFinite(entry.search_score) && Number.isFinite(entry.autocomplete_score)), `High Country IR evidence must include scored query: ${query}`);
}
assert(highCountryIrEvidence.search_average >= 80, 'High Country IR search average should be recorded and usable');
assert(highCountryIrEvidence.autocomplete_average >= 50, 'High Country IR autocomplete average should be recorded and usable');
assert((highCountryEvidence.browse?.collection_samples || []).filter((entry) => entry.product_sample_count > 0).length >= 8, 'High Country evidence must capture sampled browse collections with products');
assert((highCountryEvidence.rendered?.collection_pages || []).some((page) => Object.keys(page.filter_groups || {}).length >= 5), 'High Country rendered evidence must capture collection filters');
assert(highCountryEvidence.cart?.attempted === true && highCountryEvidence.cart?.add_result?.ok === true && highCountryEvidence.cart?.cart_result?.ok === true, 'High Country evidence must verify public cart add/read');
assert((highCountryEvidence.policy_pages || []).some((page) => /shipping/i.test(page.label) && page.ok && page.checks?.shipping), 'High Country evidence must verify rendered shipping/pickup policy content');
assert((highCountryEvidence.policy_pages || []).some((page) => /return/i.test(page.label) && page.ok && page.checks?.returns), 'High Country evidence must verify rendered return policy content');
assert((highCountryEvidence.benchmark?.results || []).length >= 3, 'High Country evidence must record outdoor-retail benchmark attempts');
assert((highCountryReport.evidence_limits || []).some((limit) => /competitor\/benchmark pages were attempted/i.test(limit)), 'High Country report must document blocked/low-signal benchmark limits');
assert((highCountryEvidence.upstream_local_assessment?.excluded_sections || []).some((entry) => entry.section === 'demandSatisfaction'), 'High Country evidence must exclude upstream demand fit');
assert((highCountryEvidence.upstream_local_assessment?.excluded_sections || []).some((entry) => entry.section === 'competitorComparison'), 'High Country evidence must exclude upstream competitor comparison');
assert(!JSON.stringify(highCountryReport).toLowerCase().includes('"sector":"pest_control"'), 'High Country report must not carry Pest Control sector as ecommerce evidence');
assert((highCountryReport.findings || []).length >= 6, 'High Country report must include at least six findings');
assert(highCountryReport.scorecard?.product_discovery_overall?.score >= 1, 'High Country report must include a product discovery score');
assert(highCountryOwnerEvidence.summary?.total_examples === 175, 'High Country owner evidence must include 175 experiments');
assert(highCountryOwnerEvidence.methodology?.examples_per_concept === 25, 'High Country owner evidence must record 25 examples per concept');
assert(highCountryOwnerEvidence.methodology?.concept_count === 7, 'High Country owner evidence must record seven executive concepts');
assert((highCountryOwnerEvidence.examples || []).length === 175, 'High Country owner evidence must include all 175 example rows');
for (const concept of [
  'Normalization',
  'Tokenization',
  'Synonyms',
  'Ranking And Field Weighting',
  'Query Expansion',
  'Document Enrichment',
  'Spanish/Bilingual Discovery'
]) {
  const conceptSummary = (highCountryOwnerEvidence.concepts || []).find((entry) => entry.concept === concept);
  const examples = (highCountryOwnerEvidence.examples || []).filter((entry) => entry.concept === concept);
  assert(conceptSummary?.example_count === 25, `High Country owner evidence must record 25 examples for ${concept}`);
  assert(examples.length === 25, `High Country owner evidence examples missing for ${concept}`);
}
assert(highCountryOwnerEvidence.summary?.search_average === 94, 'High Country owner evidence must preserve final search average');
assert(highCountryOwnerEvidence.summary?.autocomplete_average === 45, 'High Country owner evidence must preserve final autocomplete average');
assert(highCountryOwnerEvidence.summary?.uniform_experience_rate === 43, 'High Country owner evidence must preserve final uniformity rate');
assert(highCountryOwnerEvidence.summary?.search_strong_autocomplete_weak_count === 92, 'High Country owner evidence must preserve search-strong/autocomplete-weak gap count');
assert(highCountryOwnerEvidence.summary?.spanish_bilingual_autocomplete_average === 0, 'High Country owner evidence must preserve Spanish/bilingual autocomplete gap');
assert(highCountryOwnerEvidence.opportunity_model?.conservative_sitewide_sales_upside_range === '1% to 4%', 'High Country owner report must record conservative directional sales upside');
assert(highCountryOwnerEvidence.opportunity_model?.stretch_sitewide_sales_upside_range === '3% to 7%', 'High Country owner report must record stretch directional sales upside');
for (const query of ['camp chairs', 'trail running shirt', 'waterproof breathable jacket', 'hiking outfit women', 'chaqueta lluvia mujer', 'tenis hoka mujer']) {
  assert((highCountryOwnerEvidence.examples || []).some((entry) => entry.query === query), `High Country owner evidence missing expanded query: ${query}`);
}
const highCountryCompetitors = highCountryOwnerEvidence.competitor_evidence?.competitors || [];
const usableHighCountryCompetitors = highCountryCompetitors.filter((competitor) => competitor.usable_run_count >= 8);
const visibleHighCountryCompetitorNames = usableHighCountryCompetitors.map((competitor) => competitor.name);
assert(usableHighCountryCompetitors.length >= 2, 'High Country owner evidence must include at least two usable competitor benchmarks');
assert(usableHighCountryCompetitors.some((competitor) => competitor.name === 'Half-Moon Outfitters'), 'High Country owner competitor evidence must include Half-Moon Outfitters');
assert(usableHighCountryCompetitors.some((competitor) => competitor.name === 'Mast General Store'), 'High Country owner competitor evidence must include Mast General Store');
assert(highCountryCompetitors.some((competitor) => competitor.name === 'Public Lands' && competitor.usable_run_count === 0 && (competitor.runs || []).every((run) => run.status === 403)), 'High Country owner competitor evidence must document blocked Public Lands samples');
assert((highCountryOwnerEvidence.competitor_evidence?.summary?.interpretation || '').includes('not proof'), 'High Country owner competitor summary must not overclaim paid-placement absence');
const highCountryCompetitorQueryBenchmark = highCountryOwnerEvidence.competitor_query_benchmark || {};
const highCountryBenchmarkSites = highCountryCompetitorQueryBenchmark.sites || [];
assert(highCountryBenchmarkSites.length >= 2, 'High Country owner evidence must include a same-query competitor benchmark');
for (const siteName of ['Half-Moon Outfitters', 'Mast General Store']) {
  const site = highCountryBenchmarkSites.find((entry) => entry.name === siteName);
  assert(Boolean(site), `High Country same-query competitor benchmark missing site: ${siteName}`);
  assert(site?.query_count === 175, `${siteName} same-query benchmark must run all 175 protected examples`);
  assert(site?.usable_search_count === 175, `${siteName} same-query benchmark must have 175 usable search rows`);
  assert(site?.autocomplete_available_count === 175, `${siteName} same-query benchmark must have 175 public suggest rows`);
  assert((site?.runs || []).length === 175, `${siteName} same-query benchmark must preserve all individual query rows`);
  assert((site?.concept_summaries || []).length === 7, `${siteName} same-query benchmark must summarize all seven query concepts`);
  for (const concept of [
    'Normalization',
    'Tokenization',
    'Synonyms',
    'Ranking And Field Weighting',
    'Query Expansion',
    'Document Enrichment',
    'Spanish/Bilingual Discovery'
  ]) {
    const summary = (site?.concept_summaries || []).find((entry) => entry.concept === concept);
    const runs = (site?.runs || []).filter((entry) => entry.concept === concept);
    assert(summary?.query_count === 25, `${siteName} same-query concept summary must include 25 rows for ${concept}`);
    assert(runs.length === 25, `${siteName} same-query rows missing for ${concept}`);
  }
}
const highCountryHalfMoonBenchmark = highCountryBenchmarkSites.find((entry) => entry.name === 'Half-Moon Outfitters') || {};
const highCountryMastBenchmark = highCountryBenchmarkSites.find((entry) => entry.name === 'Mast General Store') || {};
assert(highCountryHalfMoonBenchmark.search_average === 99 && highCountryHalfMoonBenchmark.autocomplete_average === 38, 'High Country Half-Moon same-query benchmark summary must match repaired capture');
assert(highCountryMastBenchmark.search_average === 84 && highCountryMastBenchmark.autocomplete_average === 37, 'High Country Mast same-query benchmark summary must match repaired capture');
textIncludesAll(highCountryOwnerMarkdown, [
  'High Country Outfitters Online Customer Experience Opportunity Report',
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
  'Same-Query Competitor Benchmark',
  'Full Competitor Same-Query Dataset',
  'Competitor Paid-Placement Reference',
  'Paid-placement labels visible',
  'Unusable competitor capture attempts are retained in the structured evidence artifact but excluded from the comparison table',
  'Full Experiment Dataset',
  'Spanish/Bilingual Discovery',
  'Half-Moon Outfitters',
  'Mast General Store'
], 'High Country owner outreach markdown');
textIncludesAll(highCountryLatex, [
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
  'Reference B: Concept Results Summary',
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
], 'High Country Northvalley PDF source');
textExcludesAll(`${JSON.stringify(highCountryOwnerReport.executive_positioning)}\n${highCountryExecutiveMarkdown}\n${highCountryExecutiveLatex}`, [
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
], 'High Country executive narrative');
for (const name of visibleHighCountryCompetitorNames) {
  assert(highCountryLatex.includes(name), `High Country owner PDF source missing visible competitor: ${name}`);
}
assert(!highCountryLatex.includes('Public Lands'), 'High Country owner PDF source must not present blocked Public Lands capture as evaluated competitor data');
for (const disallowedHighCountryText of [
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
]) {
  assert(!highCountryLatex.includes(disallowedHighCountryText), `High Country owner PDF source must omit stale text: ${disallowedHighCountryText}`);
  assert(!highCountryOwnerMarkdown.includes(disallowedHighCountryText), `High Country owner markdown must omit stale text: ${disallowedHighCountryText}`);
}

const releaseChecks = readJson('deploy/release-checks.json');
assert(releaseChecks.repositoryGovernance?.git_repository_present === true, 'release checks must record initialized Git repository');
assert(releaseChecks.repositoryGovernance?.github_remote_present === true, 'release checks must record GitHub remote');
assert(releaseChecks.repositoryGovernance?.code_submitted_to_github === true, 'release checks must record successful GitHub submission');
assert(typeof releaseChecks.repositoryGovernance?.remote_url === 'string' && releaseChecks.repositoryGovernance.remote_url.includes('Northvalley-Intelligence/ecommerce-product-discovery-assessment-framework'), 'release checks must record GitHub remote URL');
assert(releaseChecks.productionParity?.production_deployed === false, 'release checks must record non-deployed production status');

const gen3Evidence = readJson('.mde/generations/GEN-003.json');
assert(gen3Evidence.validation_gate?.result === 'pass', 'GEN-003 evidence must record passing Validation Gate');
assert(gen3Evidence.validation_gate?.pass_count === '2/2', 'GEN-003 evidence must record two Validation Gate passes');
assert(gen3Evidence.repository_governance?.github_remote_present === false, 'GEN-003 evidence must record missing GitHub remote');

const gen4Evidence = readJson('.mde/generations/GEN-004.json');
assert(gen4Evidence.validation_gate?.result === 'pass', 'GEN-004 evidence must record passing Validation Gate');
assert(gen4Evidence.validation_gate?.pass_count === '2/2', 'GEN-004 evidence must record two Validation Gate passes');
assert(gen4Evidence.repository_governance?.github_remote_present === false, 'GEN-004 evidence must record missing GitHub remote');
assert(gen4Evidence.evidence_quality_notes?.some((note) => note.includes('UCLA commercial importance is stakeholder context')), 'GEN-004 evidence must keep UCLA client-size claim as stakeholder context');

const gen5Evidence = readJson('.mde/generations/GEN-005.json');
assert(gen5Evidence.validation_gate?.result === 'pass', 'GEN-005 evidence must record passing Validation Gate');
assert(gen5Evidence.validation_gate?.pass_count === '2/2', 'GEN-005 evidence must record two Validation Gate passes');
assert(gen5Evidence.repository_governance?.github_remote_present === true, 'GEN-005 evidence must record GitHub remote');
assert(gen5Evidence.repository_governance?.code_submitted_to_github === true, 'GEN-005 evidence must record successful GitHub submission');

const gen6Evidence = readJson('.mde/generations/GEN-006.json');
assert(gen6Evidence.validation_gate?.result === 'pass', 'GEN-006 evidence must record passing Validation Gate');
assert(gen6Evidence.validation_gate?.pass_count === '2/2', 'GEN-006 evidence must record two Validation Gate passes');
assert(gen6Evidence.repository_governance?.github_remote_present === true, 'GEN-006 evidence must record GitHub remote');
assert(gen6Evidence.evidence_quality_notes?.some((note) => note.includes('Concepts Sport')), 'GEN-006 evidence must keep Concepts Sport limitation explicit');
assert(gen6Evidence.evidence_quality_notes?.some((note) => note.includes('Fanatics')), 'GEN-006 evidence must keep Fanatics limitation explicit');
const gen7Evidence = readJson('.mde/generations/GEN-007.json');
assert(gen7Evidence.validation_gate?.result === 'pass', 'GEN-007 evidence must record passing Validation Gate');
assert(gen7Evidence.validation_gate?.pass_count === '2/2', 'GEN-007 evidence must record two Validation Gate passes');
assert(gen7Evidence.repository_governance?.github_remote_present === true, 'GEN-007 evidence must record GitHub remote');
assert(gen7Evidence.evidence_quality_notes?.some((note) => note.includes('Autocomplete parity is suggestion coverage')), 'GEN-007 evidence must keep autocomplete payload limitation explicit');
const gen8Evidence = readJson('.mde/generations/GEN-008.json');
assert(gen8Evidence.validation_gate?.result === 'pass', 'GEN-008 evidence must record passing Validation Gate');
assert(gen8Evidence.validation_gate?.pass_count === '2/2', 'GEN-008 evidence must record two Validation Gate passes');
assert(gen8Evidence.repository_governance?.github_remote_present === true, 'GEN-008 evidence must record GitHub remote');
assert(gen8Evidence.evidence_quality_notes?.some((note) => note.includes('20-mile PTA context is stakeholder-provided')), 'GEN-008 evidence must preserve stakeholder-context limitation');
const gen9Evidence = readJson('.mde/generations/GEN-009.json');
assert(gen9Evidence.validation_gate?.result === 'pass', 'GEN-009 evidence must record passing Validation Gate');
assert(gen9Evidence.validation_gate?.pass_count === '2/2', 'GEN-009 evidence must record two Validation Gate passes');
assert(gen9Evidence.repository_governance?.github_remote_present === true, 'GEN-009 evidence must record GitHub remote');
assert(gen9Evidence.evidence_quality_notes?.some((note) => note.includes('problem-only diagnosis')), 'GEN-009 evidence must preserve problem-only report revision note');
const gen10Evidence = readJson('.mde/generations/GEN-010.json');
assert(gen10Evidence.validation_gate?.result === 'pass', 'GEN-010 evidence must record passing Validation Gate');
assert(gen10Evidence.validation_gate?.pass_count === '2/2', 'GEN-010 evidence must record two Validation Gate passes');
assert(gen10Evidence.repository_governance?.github_remote_present === true, 'GEN-010 evidence must record GitHub remote');
assert(gen10Evidence.evidence_quality_notes?.some((note) => note.includes('Pest Control')), 'GEN-010 evidence must preserve upstream Pest Control exclusion note');
assert(gen10Evidence.evidence_quality_notes?.some((note) => note.includes('benchmark')), 'GEN-010 evidence must preserve benchmark limitation note');
assert(gen10Evidence.evidence_quality_notes?.some((note) => note.includes('complete evidence report')), 'GEN-010 evidence must preserve complete report expansion note');
const gen11Evidence = readJson('.mde/generations/GEN-011.json');
assert(gen11Evidence.validation_gate?.result === 'pass', 'GEN-011 evidence must record passing Validation Gate');
assert(gen11Evidence.validation_gate?.pass_count === '2/2', 'GEN-011 evidence must record two Validation Gate passes');
assert(gen11Evidence.repository_governance?.github_remote_present === true, 'GEN-011 evidence must record GitHub remote');
assert(gen11Evidence.evidence_quality_notes?.some((note) => note.includes('175')), 'GEN-011 evidence must preserve expanded 175-experiment note');
assert(gen11Evidence.evidence_quality_notes?.some((note) => note.includes('Spanish/bilingual')), 'GEN-011 evidence must preserve Spanish/bilingual discovery note');
assert(gen11Evidence.evidence_quality_notes?.some((note) => note.includes('paid-placement')), 'GEN-011 evidence must preserve paid-placement limitation note');
const val11 = readJson('.mde/validation-runs/VAL-011.json');
const val12 = readJson('.mde/validation-runs/VAL-012.json');
assert(val11.gate_result === 'pass' && val11.pass_count_after_run === '1/2', 'VAL-011 must record first GEN-006 Validation Gate pass');
assert(val12.gate_result === 'pass' && val12.pass_count_after_run === '2/2', 'VAL-012 must record second GEN-006 Validation Gate pass');
const val17 = readJson('.mde/validation-runs/VAL-017.json');
const val18 = readJson('.mde/validation-runs/VAL-018.json');
assert(val17.gate_result === 'pass' && val17.pass_count_after_run === '1/2', 'VAL-017 must record first GEN-007 Validation Gate pass');
assert(val18.gate_result === 'pass' && val18.pass_count_after_run === '2/2', 'VAL-018 must record second GEN-007 Validation Gate pass');
const val19 = readJson('.mde/validation-runs/VAL-019.json');
const val20 = readJson('.mde/validation-runs/VAL-020.json');
assert(val19.gate_result === 'pass' && val19.pass_count_after_run === '1/2', 'VAL-019 must record first GEN-008 Validation Gate pass');
assert(val20.gate_result === 'pass' && val20.pass_count_after_run === '2/2', 'VAL-020 must record second GEN-008 Validation Gate pass');
const val21 = readJson('.mde/validation-runs/VAL-021.json');
const val22 = readJson('.mde/validation-runs/VAL-022.json');
assert(val21.gate_result === 'pass' && val21.pass_count_after_run === '1/2', 'VAL-021 must record first GEN-009 Validation Gate pass');
assert(val22.gate_result === 'pass' && val22.pass_count_after_run === '2/2', 'VAL-022 must record second GEN-009 Validation Gate pass');
const val23 = readJson('.mde/validation-runs/VAL-023.json');
const val24 = readJson('.mde/validation-runs/VAL-024.json');
assert(val23.gate_result === 'pass' && val23.pass_count_after_run === '1/2', 'VAL-023 must record first GEN-010 Validation Gate pass');
assert(val24.gate_result === 'pass' && val24.pass_count_after_run === '2/2', 'VAL-024 must record second GEN-010 Validation Gate pass');
const val25 = readJson('.mde/validation-runs/VAL-025.json');
const val26 = readJson('.mde/validation-runs/VAL-026.json');
assert(val25.gate_result === 'pass' && val25.pass_count_after_run === '1/2', 'VAL-025 must record first GEN-010 post-PDF Validation Gate pass');
assert(val26.gate_result === 'pass' && val26.pass_count_after_run === '2/2', 'VAL-026 must record second GEN-010 post-PDF Validation Gate pass');
const val27 = readJson('.mde/validation-runs/VAL-027.json');
const val28 = readJson('.mde/validation-runs/VAL-028.json');
assert(val27.gate_result === 'pass' && val27.pass_count_after_run === '1/2', 'VAL-027 must record first GEN-010 complete-report Validation Gate pass');
assert(val28.gate_result === 'pass' && val28.pass_count_after_run === '2/2', 'VAL-028 must record second GEN-010 complete-report Validation Gate pass');
assert((val28.coverage?.complete_report_contents || '').includes('every_search_term'), 'VAL-028 must record complete report query/dataset coverage');
const val29 = readJson('.mde/validation-runs/VAL-029.json');
const val30 = readJson('.mde/validation-runs/VAL-030.json');
assert(val29.gate_result === 'pass' && val29.pass_count_after_run === '1/2', 'VAL-029 must record first GEN-010 corrected-search Validation Gate pass');
assert(val30.gate_result === 'pass' && val30.pass_count_after_run === '2/2', 'VAL-030 must record second GEN-010 corrected-search Validation Gate pass');
assert((val30.coverage?.search_capture_correction || '').includes('camp_chairs_184_rendered'), 'VAL-030 must record corrected camp chairs rendered-search coverage');
const val31 = readJson('.mde/validation-runs/VAL-031.json');
const val32 = readJson('.mde/validation-runs/VAL-032.json');
assert(val31.gate_result === 'pass' && val31.pass_count_after_run === '1/2', 'VAL-031 must record first GEN-010 autocomplete follow-up Validation Gate pass');
assert(val32.gate_result === 'pass' && val32.pass_count_after_run === '2/2', 'VAL-032 must record second GEN-010 autocomplete follow-up Validation Gate pass');
assert((val32.coverage?.autocomplete_followup_correction || '').includes('camp_snap'), 'VAL-032 must record camp autocomplete follow-up coverage');
const val33 = readJson('.mde/validation-runs/VAL-033.json');
const val34 = readJson('.mde/validation-runs/VAL-034.json');
assert(val33.gate_result === 'pass' && val33.pass_count_after_run === '1/2', 'VAL-033 must record first GEN-010 IR concept refinement Validation Gate pass');
assert(val34.gate_result === 'pass' && val34.pass_count_after_run === '2/2', 'VAL-034 must record second GEN-010 IR concept refinement Validation Gate pass');
assert((val34.coverage?.ir_concept_refinement || '').includes('article_5_10'), 'VAL-034 must record Article 5-10 IR concept coverage');
assert((val34.coverage?.ir_concept_refinement || '').includes('trail_running_shirt_autocomplete_gap'), 'VAL-034 must record the trail running shirt autocomplete gap');
const val35 = readJson('.mde/validation-runs/VAL-035.json');
const val36 = readJson('.mde/validation-runs/VAL-036.json');
assert(val35.gate_result === 'pass' && val35.pass_count_after_run === '1/2', 'VAL-035 must record first GEN-011 owner outreach Validation Gate pass');
assert(val36.gate_result === 'pass' && val36.pass_count_after_run === '2/2', 'VAL-036 must record second GEN-011 owner outreach Validation Gate pass');
assert((val36.coverage?.owner_outreach_report || '').includes('175_query_experiments'), 'VAL-036 must record expanded 175-query owner report coverage');
assert((val36.coverage?.owner_outreach_report || '').includes('two_usable_competitors'), 'VAL-036 must record two usable competitor benchmarks');
assert((val36.coverage?.owner_outreach_report || '').includes('paid_placement_limits'), 'VAL-036 must record paid-placement evidence limits');
const val37 = readJson('.mde/validation-runs/VAL-037.json');
const val38 = readJson('.mde/validation-runs/VAL-038.json');
assert(val37.gate_result === 'pass' && val37.pass_count_after_run === '1/2', 'VAL-037 must record first GEN-011 same-query competitor refinement Validation Gate pass');
assert(val38.gate_result === 'pass' && val38.pass_count_after_run === '2/2', 'VAL-038 must record second GEN-011 same-query competitor refinement Validation Gate pass');
assert((val38.coverage?.same_query_competitor_benchmark || '').includes('half_moon_175'), 'VAL-038 must record Half-Moon 175-query competitor benchmark coverage');
assert((val38.coverage?.same_query_competitor_benchmark || '').includes('mast_175'), 'VAL-038 must record Mast 175-query competitor benchmark coverage');
assert((val38.coverage?.pdf_output || '').includes('30_pages'), 'VAL-038 must record revised 30-page PDF output');
const val39 = readJson('.mde/validation-runs/VAL-039.json');
const val40 = readJson('.mde/validation-runs/VAL-040.json');
assert(val39.gate_result === 'pass' && val39.pass_count_after_run === '1/2', 'VAL-039 must record first GEN-011 executive competitor win/loss Validation Gate pass');
assert(val40.gate_result === 'pass' && val40.pass_count_after_run === '2/2', 'VAL-040 must record second GEN-011 executive competitor win/loss Validation Gate pass');
assert((val40.coverage?.executive_summary_competitor_win_loss || '').includes('preserved'), 'VAL-040 must record executive competitor win/loss coverage');
assert((val40.coverage?.grounding || '').includes('no_new_evaluation'), 'VAL-040 must record saved-evidence/no-new-evaluation grounding');
const val41 = readJson('.mde/validation-runs/VAL-041.json');
const val42 = readJson('.mde/validation-runs/VAL-042.json');
assert(val41.gate_result === 'pass' && val41.pass_count_after_run === '1/2', 'VAL-041 must record first final GEN-011 executive competitor win/loss Validation Gate pass');
assert(val42.gate_result === 'pass' && val42.pass_count_after_run === '2/2', 'VAL-042 must record second final GEN-011 executive competitor win/loss Validation Gate pass');
assert((val42.coverage?.executive_summary_competitor_win_loss || '').includes('validated'), 'VAL-042 must record final executive competitor win/loss coverage');
assert((val42.coverage?.grounding || '').includes('no_new_evaluation'), 'VAL-042 must record final saved-evidence/no-new-evaluation grounding');
const val43 = readJson('.mde/validation-runs/VAL-043.json');
const val44 = readJson('.mde/validation-runs/VAL-044.json');
assert(val43.gate_result === 'pass' && val43.pass_count_after_run === '1/2', 'VAL-043 must record first GEN-011 customer-experience executive narrative Validation Gate pass');
assert(val44.gate_result === 'pass' && val44.pass_count_after_run === '2/2', 'VAL-044 must record second GEN-011 customer-experience executive narrative Validation Gate pass');
assert((val44.coverage?.customer_experience_executive_narrative || '').includes('validated'), 'VAL-044 must record customer-experience executive narrative coverage');
assert((val44.coverage?.executive_consulting_positioning || '').includes('customer_first'), 'VAL-044 must record customer-first consulting positioning coverage');
assert((val44.coverage?.grounding || '').includes('no_new_live_evaluation'), 'VAL-044 must record saved-evidence/no-new-live-evaluation grounding');
const val45 = readJson('.mde/validation-runs/VAL-045.json');
const val46 = readJson('.mde/validation-runs/VAL-046.json');
assert(val45.gate_result === 'pass' && val45.pass_count_after_run === '1/2', 'VAL-045 must record first GEN-011 executive page design Validation Gate pass');
assert(val46.gate_result === 'pass' && val46.pass_count_after_run === '2/2', 'VAL-046 must record second GEN-011 executive page design Validation Gate pass');
assert((val46.coverage?.executive_page_design || '').includes('customer_effort_visual'), 'VAL-046 must record customer-effort visual coverage');
assert((val46.coverage?.page_three_visual_review || '').includes('90_day_opportunity_roadmap'), 'VAL-046 must record 90-day roadmap visual review coverage');
assert((val46.coverage?.narrative_integrity || '').includes('customer_experience_first'), 'VAL-046 must preserve customer-experience-first narrative coverage');
assert((releaseChecks.repositoryGovernance?.latest_high_country_combined_report_validation_runs || []).includes('VAL-046'), 'release checks must record latest High Country executive page design validation run');

const coverage = readJson('framework/coverage-matrix.json');
const coveredBdds = new Set((coverage.mission_coverage || []).flatMap((item) => item.bdd_refs || []));
includesAll([...coveredBdds], [
  'BDD-001',
  'BDD-002',
  'BDD-003',
  'BDD-004',
  'BDD-005',
  'BDD-006',
  'BDD-007',
  'BDD-008',
  'BDD-009',
  'BDD-010',
  'BDD-011',
  'BDD-013'
], 'coverage matrix BDD references');

if (!coveredBdds.has('BDD-012')) {
  warnings.push('BDD-012 independent evaluator calibration remains deferred until a second evaluator and completed pilot exist.');
}
if (!coveredBdds.has('BDD-014')) {
  warnings.push('BDD-014 PDF layout validation requires external latexmk, pdftotext, and pdftoppm checks for PDF changes.');
}

if (failures.length > 0) {
  console.error('Validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Validation passed');
console.log(`Artifacts checked: ${requiredFiles.length}`);
console.log(`Assessment areas: ${requiredAreas.length}`);
console.log(`Score dimensions: ${scoreDimensions.length}`);
console.log(`Scorecard categories: ${scorecardCategories.length}`);
for (const warning of warnings) console.log(`Warning: ${warning}`);
