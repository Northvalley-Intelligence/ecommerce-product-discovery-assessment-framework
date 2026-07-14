import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const GEN = 'GEN-010';
const TARGET = 'https://highcountryoutfitters.com/';
const ROOT = process.cwd();
const evidencePath = path.join(ROOT, 'assessments/high-country-outfitters/ecommerce-evidence', GEN, 'highcountryoutfitters-ecommerce-evidence.json');
const irEvidenceDir = path.join(ROOT, 'assessments/high-country-outfitters/ir-concept-evidence', GEN);
const irEvidencePath = path.join(irEvidenceDir, 'highcountryoutfitters-ir-concept-evidence.json');

const IR_TESTS = [
  {
    article: 'Article 5',
    concept: 'Normalization',
    query: 'womens rain jacket',
    real_world_reason: 'Outdoor apparel shoppers often omit apostrophes while searching for women rainwear.',
    ir_question: "Does search normalize womens to women/women's and still recover rain jackets?",
    relevance_terms: ['women', 'jacket', 'rain', 'torrentshell', 'beta', 'anorak', 'shell']
  },
  {
    article: 'Article 5',
    concept: 'Normalization',
    query: 'mens patagonia fleece',
    real_world_reason: "Shoppers commonly omit the apostrophe in men's and combine gender, brand, and material.",
    ir_question: "Does search normalize mens to men/men's while preserving Patagonia and fleece intent?",
    relevance_terms: ['men', 'patagonia', 'fleece', 'better sweater', 'retro pile']
  },
  {
    article: 'Article 6',
    concept: 'Tokenization',
    query: 'long sleeve shirt',
    real_world_reason: 'Long-sleeve tops are a common apparel need and customers type the phrase as separate tokens.',
    ir_question: 'Does search tokenize the phrase so sleeve and shirt work together instead of independently?',
    relevance_terms: ['long sleeve', 'shirt', 'capilene', 'bamboo']
  },
  {
    article: 'Article 6',
    concept: 'Tokenization',
    query: '1/4 zip pullover',
    real_world_reason: 'Customers use slash notation for quarter-zip pullovers instead of spelling out quarter zip.',
    ir_question: 'Does search handle punctuation and numeric tokens in 1/4 zip?',
    relevance_terms: ['1/4 zip', 'quarter zip', 'pullover']
  },
  {
    article: 'Article 7',
    concept: 'Synonyms',
    query: 'rain shell',
    real_world_reason: 'Outdoor customers often say shell when they mean a rain jacket or waterproof layer.',
    ir_question: 'Does search connect shell wording to rain-jacket inventory?',
    relevance_terms: ['shell', 'rain', 'jacket', 'fineline']
  },
  {
    article: 'Article 7',
    concept: 'Synonyms',
    query: 'puffer jacket',
    real_world_reason: 'Puffer is a common consumer synonym for insulated or down jackets.',
    ir_question: 'Does search and autocomplete bridge puffer to insulated/down jacket language?',
    relevance_terms: ['puffer', 'nano puff', 'down', 'jacket', 'insulated']
  },
  {
    article: 'Article 8',
    concept: 'Field Weighting',
    query: 'patagonia womens jacket',
    real_world_reason: 'A brand-aware shopper may combine vendor, gender, and category in one query.',
    ir_question: 'Do brand/vendor and gender/category fields rank Patagonia women jacket products first?',
    relevance_terms: ['patagonia', 'women', 'jacket']
  },
  {
    article: 'Article 8',
    concept: 'Field Weighting',
    query: 'vuori joggers women',
    real_world_reason: 'A customer may know the brand and product type but use an informal gender order.',
    ir_question: 'Do brand and product-type fields outweigh broad text matches enough to surface Vuori women joggers?',
    relevance_terms: ['vuori', 'women', 'jogger']
  },
  {
    article: 'Article 9',
    concept: 'Query Expansion',
    query: 'sun hoodie',
    real_world_reason: 'Sun hoodie is a common outdoor phrase for UPF hoodies and sun-protection tops.',
    ir_question: 'Does search expand hoodie/hoody and sun-protection language into relevant apparel?',
    relevance_terms: ['sun', 'hoodie', 'hoody', 'capilene', 'bamboo']
  },
  {
    article: 'Article 9',
    concept: 'Query Expansion',
    query: 'trail running shirt',
    real_world_reason: 'Trail runners often search for lightweight technical shirts by activity rather than product title.',
    ir_question: 'Does search expand activity intent into technical running or performance shirts?',
    relevance_terms: ['trail', 'running', 'cormac', 'capilene', 'technical', 'merino', 'shirt']
  },
  {
    article: 'Article 10',
    concept: 'Document Enrichment',
    query: 'UPF shirt women',
    real_world_reason: 'UPF is a feature-level apparel attribute that may live in tags, descriptions, or product specs.',
    ir_question: 'Do enriched attributes expose women sun-protection shirts even when UPF is not the main title?',
    relevance_terms: ['upf', 'women', 'shirt', 'sun', 'bamboo', 'performance']
  },
  {
    article: 'Article 10',
    concept: 'Document Enrichment',
    query: 'fleece pullover women',
    real_world_reason: 'Fleece and pullover are material/style attributes that can be split across title, tags, and variants.',
    ir_question: 'Do enriched product fields expose women fleece pullovers instead of only exact-title matches?',
    relevance_terms: ['women', 'fleece', 'pullover', 'hoodie', 'sweater']
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function searchUrl(query) {
  return `${TARGET}search?options%5Bprefix%5D=last&q=${encodeURIComponent(query)}`;
}

function searchResultCount(title = '') {
  const match = title.match(/Search:\s*([\d,]+)\s+results found/i);
  if (match) return Number(match[1].replace(/,/g, ''));
  if (/no results|0 results/i.test(title)) return 0;
  return null;
}

function isBlocked(title = '', text = '') {
  return /verifying your connection|access denied|site maintenance|403 forbidden/i.test(`${title} ${text}`);
}

function normalize(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function relevanceCount(test, titles = []) {
  const haystacks = titles.map(normalize);
  return haystacks.filter((title) => test.relevance_terms.some((term) => title.includes(normalize(term)))).length;
}

function firstRelevant(test, titles = []) {
  const first = normalize(titles[0] || '');
  return Boolean(first && test.relevance_terms.some((term) => first.includes(normalize(term))));
}

function scoreSearch(test, result) {
  if (result.blocked || result.result_count === null || result.result_count === undefined) return null;
  if (result.result_count === 0) return 0;
  const relevant = relevanceCount(test, result.product_titles);
  let score = 70;
  if (result.product_titles.length > 0) score += 5;
  if (firstRelevant(test, result.product_titles)) score += 10;
  if (relevant >= 3) score += 10;
  else if (relevant > 0) score += 5;
  if (result.result_count > 0 && result.result_count <= 250) score += 5;
  if (result.result_count > 350) score -= 7;
  return Math.max(0, Math.min(100, score));
}

function scoreAutocomplete(test, result) {
  if (!result.ok || result.status !== 200) return null;
  const products = result.products || [];
  const collections = result.collections || [];
  const queries = result.queries || [];
  const pages = result.pages || [];
  if (!products.length && !collections.length && !queries.length && !pages.length) return 0;
  if (!products.length) return collections.length ? 65 : 60;
  const relevant = relevanceCount(test, products);
  let score = 70;
  if (firstRelevant(test, products)) score += 15;
  if (relevant >= 2) score += 10;
  else if (relevant > 0) score += 5;
  if (collections.length || queries.length || pages.length) score += 5;
  return Math.max(0, Math.min(100, score));
}

function scoreBand(score) {
  if (score === null || score === undefined) return 'unverified';
  if (score >= 90) return 'strong';
  if (score >= 75) return 'usable';
  if (score >= 50) return 'partial';
  if (score > 0) return 'weak';
  return 'no assistance';
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

async function collectSearch(page, test) {
  await page.goto(searchUrl(test.query), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  const title = await page.title();
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const productTitles = await page
    .locator('a[href*="/products/"]')
    .evaluateAll((anchors) => anchors
      .map((anchor) => (anchor.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 6))
    .catch(() => []);
  return {
    url: searchUrl(test.query),
    title,
    result_count: searchResultCount(title),
    blocked: isBlocked(title, text),
    product_titles: productTitles
  };
}

async function collectSuggest(page, test) {
  return page.evaluate(async (query) => {
    const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query,page&resources[limit]=6`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return {
        status: response.status,
        ok: response.ok,
        error: `non_json_suggest_response: ${error.message}`,
        products: [],
        collections: [],
        queries: [],
        pages: []
      };
    }
    const resources = json?.resources?.results || {};
    return {
      status: response.status,
      ok: response.ok,
      products: (resources.products || []).map((item) => item.title).filter(Boolean).slice(0, 6),
      collections: (resources.collections || []).map((item) => item.title).filter(Boolean).slice(0, 6),
      queries: (resources.queries || []).map((item) => item.text).filter(Boolean).slice(0, 6),
      pages: (resources.pages || []).map((item) => item.title).filter(Boolean).slice(0, 6)
    };
  }, test.query);
}

function observedSearchNote(result) {
  if (result.blocked) return 'Rendered page reached access verification; do not count as zero-result evidence.';
  if (result.result_count === 0) return 'Rendered search produced zero results.';
  return `Rendered search showed ${result.result_count} results; sampled products: ${result.product_titles.slice(0, 3).join('; ') || 'none captured'}.`;
}

function observedAutocompleteNote(result) {
  if (!result.ok) return `Suggest API returned status ${result.status}; autocomplete was not verified.`;
  const parts = [];
  if (result.products.length) parts.push(`products: ${result.products.slice(0, 3).join('; ')}`);
  if (result.collections.length) parts.push(`collections: ${result.collections.slice(0, 3).join('; ')}`);
  if (result.queries.length) parts.push(`queries: ${result.queries.slice(0, 3).join('; ')}`);
  if (result.pages.length) parts.push(`pages: ${result.pages.slice(0, 3).join('; ')}`);
  return parts.length ? `Suggest API returned ${parts.join(' | ')}.` : 'Suggest API returned no product, collection, query, or page suggestions.';
}

function summarizeByConcept(examples) {
  const byConcept = new Map();
  for (const example of examples) {
    const key = `${example.article}: ${example.concept}`;
    if (!byConcept.has(key)) {
      byConcept.set(key, {
        article: example.article,
        concept: example.concept,
        queries: [],
        search_scores: [],
        autocomplete_scores: []
      });
    }
    const group = byConcept.get(key);
    group.queries.push(example.query);
    group.search_scores.push(example.search_score);
    group.autocomplete_scores.push(example.autocomplete_score);
  }
  return [...byConcept.values()].map((group) => ({
    article: group.article,
    concept: group.concept,
    queries: group.queries,
    search_average: average(group.search_scores),
    autocomplete_average: average(group.autocomplete_scores)
  }));
}

async function main() {
  const existingEvidence = readJson(evidencePath);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);

  const examples = [];
  for (const test of IR_TESTS) {
    const search = await collectSearch(page, test);
    const autocomplete = await collectSuggest(page, test);
    const searchScore = scoreSearch(test, search);
    const autocompleteScore = scoreAutocomplete(test, autocomplete);
    examples.push({
      ...test,
      search,
      autocomplete,
      search_score: searchScore,
      autocomplete_score: autocompleteScore,
      search_score_band: scoreBand(searchScore),
      autocomplete_score_band: scoreBand(autocompleteScore),
      observed_search: observedSearchNote(search),
      observed_autocomplete: observedAutocompleteNote(autocomplete)
    });
  }

  await browser.close();

  const irConceptTests = {
    evidence_id: 'highcountryoutfitters-ir-concept-evidence-2026-07-02',
    generated_at: new Date().toISOString(),
    target: existingEvidence.target,
    scope: 'Apparel-domain information-retrieval concept tests requested for the High Country Outfitters report.',
    scoring_note: 'Scores are bounded public-evidence judgments from rendered search pages and browser-context Shopify suggest API responses. They are diagnostic IR concept scores, not replacements for the main report scorecard.',
    example_count: examples.length,
    search_example_count: examples.filter((example) => example.search_score !== null).length,
    autocomplete_example_count: examples.filter((example) => example.autocomplete_score !== null).length,
    search_average: average(examples.map((example) => example.search_score)),
    autocomplete_average: average(examples.map((example) => example.autocomplete_score)),
    concepts: summarizeByConcept(examples),
    examples
  };

  existingEvidence.ir_concept_tests = irConceptTests;
  existingEvidence.reconciled_at = new Date().toISOString();
  existingEvidence.capture_reconciliation = {
    ...(existingEvidence.capture_reconciliation || {}),
    ir_concept_tests: 'Added 12 apparel-domain IR concept examples across normalization, tokenization, synonyms, field weighting, query expansion, and document enrichment, scored for rendered search and browser-context autocomplete.'
  };

  writeJson(evidencePath, existingEvidence);
  writeJson(irEvidencePath, irConceptTests);
  console.log(JSON.stringify({
    evidencePath: path.relative(ROOT, evidencePath),
    irEvidencePath: path.relative(ROOT, irEvidencePath),
    exampleCount: irConceptTests.example_count,
    searchAverage: irConceptTests.search_average,
    autocompleteAverage: irConceptTests.autocomplete_average
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
