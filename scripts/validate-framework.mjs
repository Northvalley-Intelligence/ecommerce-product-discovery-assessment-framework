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
  'deploy/release-checks.json',
  '.mde/generations/GEN-003.json',
  '.mde/generations/GEN-004.json',
  '.mde/generations/GEN-005.json',
  '.mde/validation-runs/VAL-005.json',
  '.mde/validation-runs/VAL-006.json',
  '.mde/validation-runs/VAL-007.json',
  '.mde/validation-runs/VAL-008.json',
  '.mde/validation-runs/VAL-009.json',
  '.mde/validation-runs/VAL-010.json'
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
  'Rendered public-retail, public-wholesale, and 36-query',
  'Executive Summary',
  'Evidence Snapshot',
  'Normalization Matrix',
  'UCLA/Bruins',
  'Search And Autocomplete To Browse',
  'Search and autocomplete normalization',
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
