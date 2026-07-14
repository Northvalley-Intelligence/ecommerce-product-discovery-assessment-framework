import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const GEN = 'GEN-012';
const ROOT = process.cwd();
const TARGET = 'https://shopdressup.com/';
const TARGET_NAME = 'Dress Up';
const TARGET_DOMAIN = 'shopdressup.com';
const TARGET_SLUG = 'dress-up';
const REQUEST_DELAY_MS = Number(process.env.DRESSUP_REQUEST_DELAY_MS || 250);
const COMPETITOR_QUERY_DELAY_MS = Number(process.env.DRESSUP_COMPETITOR_QUERY_DELAY_MS || 150);
const COMPETITOR_MAX_ATTEMPTS = Number(process.env.DRESSUP_COMPETITOR_MAX_ATTEMPTS || 1);
const COMPETITOR_RETRY_BACKOFF_MS = Number(process.env.DRESSUP_COMPETITOR_RETRY_BACKOFF_MS || 1000);

const evidenceDir = path.join(ROOT, `assessments/${TARGET_SLUG}/expanded-ir-evidence`, GEN);
const evidencePath = path.join(evidenceDir, 'dressup-expanded-ir-evidence.json');
const reportDir = path.join(ROOT, `assessments/${TARGET_SLUG}/owner-outreach-report`, GEN);
const reportJsonPath = path.join(reportDir, 'dressup-owner-outreach-report.json');
const reportMdPath = path.join(reportDir, 'dressup-owner-outreach-report.md');
const reportTexPath = path.join(ROOT, 'reports/dressup-ecommerce-executive-report.tex');

function q(query, intent, reason, terms = []) {
  return { query, intent, reason, relevance_terms: [...new Set([...keywordTerms(query), ...terms].map(normalize).filter(Boolean))] };
}

function group(concept, executive_explanation, why_it_matters, tests) {
  return { concept, executive_explanation, why_it_matters, tests };
}

const TEST_GROUPS = [
  group(
    'Normalization',
    'Whether the site understands normal shopper typing variations such as plurals, missing apostrophes, shorthand wording, and category variants.',
    'Good normalization keeps motivated shoppers from needing exact menu labels or catalog-perfect wording.',
    [
      q('womens dresses', 'women dresses', "Shoppers often omit the apostrophe in women's.", ['women', 'dress']),
      q('wedding guest dresses', 'wedding guest dresses', 'Occasion-led dress searches are common boutique behavior.', ['wedding', 'guest', 'dress']),
      q('mini dress', 'mini dresses', 'Singular and plural dress length wording should connect.', ['mini', 'dress']),
      q('maxi dresses', 'maxi dresses', 'Length-led dress searches should recover product families.', ['maxi', 'dress']),
      q('rompers jumpsuits', 'rompers and jumpsuits', 'Customers may omit punctuation or connectors.', ['romper', 'jumpsuit']),
      q('graphic tees', 'graphic t-shirts', 'Tee and t-shirt wording should connect.', ['graphic', 'tee', 'shirt']),
      q('game day outfits', 'game day outfits', 'Game day is a major boutique collection and shopper use case.', ['game', 'day', 'outfit']),
      q('white dress', 'white dresses', 'Color plus product wording should be consistently supported.', ['white', 'dress']),
      q('denim shorts', 'denim shorts', 'Material plus product category should recover bottoms.', ['denim', 'short']),
      q('wide leg jeans', 'wide-leg jeans', 'Fit wording should work with and without hyphenation.', ['wide', 'leg', 'jean'])
    ]
  ),
  group(
    'Tokenization',
    'Whether the site handles multi-word fashion phrases as customer intent rather than isolated words.',
    'Boutique shoppers often search in phrases such as little black dress, square neck top, or two piece set.',
    [
      q('little black dress', 'little black dress', 'A classic multi-word phrase should stay intact.', ['black', 'dress']),
      q('puff sleeve dress', 'puff-sleeve dress', 'Sleeve-shape phrasing should connect to dresses.', ['puff', 'sleeve', 'dress']),
      q('two piece set', 'matching set', 'Customers may describe matching sets by structure.', ['two', 'piece', 'set', 'matching']),
      q('high rise jeans', 'high-rise jeans', 'Fit terms should combine with denim category.', ['high', 'rise', 'jean']),
      q('square neck top', 'square-neck top', 'Neckline phrases should retrieve tops.', ['square', 'neck', 'top']),
      q('wide leg pants', 'wide-leg pants', 'Fit and silhouette terms should combine.', ['wide', 'leg', 'pant']),
      q('off shoulder dress', 'off-shoulder dress', 'Style phrases should not require exact hyphenation.', ['off', 'shoulder', 'dress']),
      q('long sleeve mini dress', 'long-sleeve mini dress', 'Sleeve length and dress length should combine.', ['long', 'sleeve', 'mini', 'dress']),
      q('button down blouse', 'button-down blouse', 'Customers use blouse and shirt language interchangeably.', ['button', 'down', 'blouse', 'shirt']),
      q('game day dress', 'game day dress', 'Occasion plus product searches should connect to collections.', ['game', 'day', 'dress'])
    ]
  ),
  group(
    'Customer Language',
    'Whether customer wording maps to retailer language: going out top, date night dress, brunch outfit, vacation dress, and similar terms.',
    'Customer-language coverage makes product finding feel natural and reduces browsing effort.',
    [
      q('going out top', 'going-out top', 'Shoppers often describe the occasion before the product.', ['going', 'out', 'top']),
      q('date night dress', 'date night dress', 'Occasion language should lead to relevant dresses.', ['date', 'night', 'dress']),
      q('brunch outfit', 'brunch outfit', 'Outfit phrasing should connect to collections or products.', ['brunch', 'outfit']),
      q('vacation dress', 'vacation dress', 'Travel and resort wording should recover seasonal dresses.', ['vacation', 'dress', 'resort']),
      q('workwear dress', 'work dress', 'Workwear and work dress should connect.', ['work', 'dress']),
      q('bridal shower dress', 'bridal shower dress', 'Bridal occasion phrasing should find white/bridal options.', ['bridal', 'shower', 'dress', 'white']),
      q('mom and me dress', 'mom and me matching', 'Collection language should support family matching intent.', ['mom', 'me', 'dress', 'matching']),
      q('oversized sweater', 'oversized sweater', 'Fit/style descriptors should retrieve sweaters.', ['oversized', 'sweater']),
      q('skort', 'skort', 'Boutique shoppers use compact category language.', ['skort', 'skirt', 'short']),
      q('faux leather leggings', 'faux leather leggings', 'Material and style wording should connect.', ['faux', 'leather', 'legging'])
    ]
  ),
  group(
    'Ranking And Field Weighting',
    'Whether product type, color, occasion, team, style, and accessory fields appear to influence what rises first.',
    'Strong first results create confidence because shoppers quickly see that the store understands their intent.',
    [
      q('pink midi dress', 'pink midi dress', 'Color, length, and product type should all matter.', ['pink', 'midi', 'dress']),
      q('white mini dress', 'white mini dress', 'Color and length should narrow dresses.', ['white', 'mini', 'dress']),
      q('black romper', 'black romper', 'Color plus product type should rank obvious products.', ['black', 'romper']),
      q('denim jacket women', 'women denim jacket', 'Material, product, and audience should combine.', ['denim', 'jacket', 'women']),
      q('gold hoop earrings', 'gold hoop earrings', 'Accessory material and type should both matter.', ['gold', 'hoop', 'earring']),
      q('western boots', 'western boots', 'Trend and product type should connect to shoes.', ['western', 'boot']),
      q('georgia game day', 'Georgia game day apparel', 'Team/state collection language should rank relevant game day items.', ['georgia', 'game', 'day']),
      q('tennessee game day', 'Tennessee game day apparel', 'Regional game day collection language should rank relevant items.', ['tennessee', 'game', 'day']),
      q('floral maxi dress', 'floral maxi dress', 'Print plus dress length should combine.', ['floral', 'maxi', 'dress']),
      q('blue midi dress', 'blue midi dress', 'Color and length should both influence dress discovery.', ['blue', 'midi', 'dress'])
    ]
  ),
  group(
    'Query Expansion',
    'Whether broader needs such as wedding guest outfit, graduation dress, teacher outfit, or vacation outfit expand into useful products.',
    'Expansion helps shoppers who know the occasion but not the exact item name.',
    [
      q('wedding guest outfit', 'wedding guest outfit', 'The shopper may want a collection, not one exact product.', ['wedding', 'guest', 'outfit', 'dress']),
      q('beach vacation outfit', 'beach vacation outfit', 'Travel use cases should connect to resort and summer products.', ['beach', 'vacation', 'outfit']),
      q('graduation dress', 'graduation dress', 'Event searches should recover relevant dresses.', ['graduation', 'dress', 'white']),
      q('teacher outfit', 'teacher outfit', 'Professional-use searches should map to workwear.', ['teacher', 'outfit', 'work']),
      q('sorority recruitment dress', 'sorority recruitment dress', 'College occasion phrasing should connect to dresses.', ['sorority', 'recruitment', 'dress']),
      q('concert outfit', 'concert outfit', 'Occasion-led discovery can surface trend collections.', ['concert', 'outfit']),
      q('game day accessories', 'game day accessories', 'Accessory searches should connect to game day collections.', ['game', 'day', 'accessory']),
      q('summer outfit', 'summer outfit', 'Seasonal intent should expand to collections.', ['summer', 'outfit']),
      q('fall transition outfit', 'fall transition outfit', 'Seasonal-transition language should recover layers and outfits.', ['fall', 'transition', 'outfit']),
      q('gift for her', 'gift for her', 'Gift intent should reveal accessories, gift cards, or curated collections.', ['gift', 'her'])
    ]
  ),
  group(
    'Product Attribute Coverage',
    'Whether searchable fields include useful fashion attributes such as fabric, cut, neckline, sleeve, stretch, and fit.',
    'Attribute coverage lets shoppers search by the details that make an item feel right.',
    [
      q('linen dress', 'linen dress', 'Fabric should be searchable.', ['linen', 'dress']),
      q('smocked bodice dress', 'smocked bodice dress', 'Construction detail should retrieve dresses.', ['smocked', 'bodice', 'dress']),
      q('ribbed tank', 'ribbed tank', 'Texture and product type should combine.', ['ribbed', 'tank']),
      q('satin midi skirt', 'satin midi skirt', 'Fabric plus length plus product should retrieve skirts.', ['satin', 'midi', 'skirt']),
      q('crochet top', 'crochet top', 'Fabric/texture language should map to tops.', ['crochet', 'top']),
      q('vegan leather shorts', 'vegan leather shorts', 'Material attribute should not be ignored.', ['vegan', 'leather', 'short']),
      q('adjustable strap cami', 'adjustable strap cami', 'Fit/construction detail should retrieve camis.', ['adjustable', 'strap', 'cami', 'tank']),
      q('lightweight cardigan', 'lightweight cardigan', 'Weight and product type should combine.', ['lightweight', 'cardigan']),
      q('stretchy denim', 'stretch denim', 'Fit benefit should map to denim.', ['stretch', 'denim', 'jean']),
      q('non slip sandals', 'non-slip sandals', 'Shoe benefit should be searchable.', ['non', 'slip', 'sandal'])
    ]
  ),
  group(
    'Spanish/Bilingual Discovery',
    'Whether Spanish or mixed Spanish-English searches can guide shoppers to English-language boutique products.',
    'Bilingual discovery is a market-access issue: shoppers should not need English catalog-perfect language to find products.',
    [
      q('vestido blanco', 'white dress in Spanish', 'White dress searches may use Spanish terms.', ['white', 'dress']),
      q('vestido fiesta', 'party dress in Spanish', 'Occasion dress language may be Spanish.', ['party', 'dress']),
      q('vestido boda invitada', 'wedding guest dress in Spanish', 'Wedding guest intent may be bilingual.', ['wedding', 'guest', 'dress']),
      q('blusa mujer', 'women blouse in Spanish', 'Blouse searches may use Spanish nouns.', ['women', 'blouse', 'top']),
      q('jeans mujer', 'women jeans in Spanish', 'Denim searches may be bilingual.', ['women', 'jean']),
      q('sandalias mujer', 'women sandals in Spanish', 'Footwear shoppers may use Spanish category terms.', ['women', 'sandal']),
      q('botas vaqueras', 'western boots in Spanish', 'Western boot language may be Spanish.', ['western', 'boot']),
      q('falda negra', 'black skirt in Spanish', 'Color and category may be Spanish.', ['black', 'skirt']),
      q('conjunto dos piezas', 'two-piece set in Spanish', 'Set wording may be Spanish.', ['two', 'piece', 'set', 'matching']),
      q('regalo mujer', 'gift for her in Spanish', 'Gift intent may be Spanish.', ['gift', 'women', 'her'])
    ]
  )
];

const COMPETITORS = [
  {
    name: 'Red Dress',
    classification: 'Online women boutique benchmark',
    source_url: 'https://www.reddress.com/',
    overlap: 'Women apparel, dresses, accessories, shoes, occasion and boutique shopping.',
    searchUrl: (query) => `https://www.reddress.com/search?q=${encodeURIComponent(query)}`
  },
  {
    name: 'Pink Lily',
    classification: 'Online women boutique benchmark',
    source_url: 'https://pinklily.com/',
    overlap: 'Women boutique apparel, dresses, seasonal outfits, shoes, accessories, and gifts.',
    searchUrl: (query) => `https://pinklily.com/search?q=${encodeURIComponent(query)}`
  },
  {
    name: 'Impressions',
    classification: 'Online women boutique benchmark',
    source_url: 'https://shopimpressions.com/',
    overlap: 'Women boutique apparel, dresses, occasion outfits, accessories, and online discovery.',
    searchUrl: (query) => `https://shopimpressions.com/search?q=${encodeURIComponent(query)}`
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

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9/+\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function keywordTerms(query = '') {
  const stop = new Set(['and', 'for', 'with', 'the', 'her', 'him', 'mujer', 'dos']);
  return normalize(query).split(/\s+/).filter((term) => term.length > 2 && !stop.has(term));
}

function searchUrl(query) {
  return `${TARGET}search?options%5Bprefix%5D=last&q=${encodeURIComponent(query)}`;
}

function searchResultCount(title = '', text = '') {
  const match = `${title} ${text.slice(0, 400)}`.match(/Search:\s*([\d,]+)\s+results found/i);
  if (match) return Number(match[1].replace(/,/g, ''));
  if (/no results|0 results|did not match any products/i.test(`${title} ${text.slice(0, 800)}`)) return 0;
  return null;
}

function isBlocked(title = '', text = '', status = 0) {
  return [401, 403, 429, 503].includes(status) || /verifying your connection|access denied|site maintenance|403 forbidden|captcha/i.test(`${title} ${text}`);
}

function compactTitle(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/\$[\d,.]+/g, '')
    .replace(/Sold Out|Sale|Regular price|Unit price|Quick view/gi, '')
    .trim()
    .slice(0, 150);
}

function compactExcerpt(text = '', max = 1500) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function containsTerm(haystack, term) {
  const h = normalize(haystack);
  const t = normalize(term);
  if (!t) return false;
  if (h.includes(t)) return true;
  if (t.endsWith('s') && h.includes(t.slice(0, -1))) return true;
  if (t.endsWith('ing') && h.includes(t.slice(0, -3))) return true;
  return false;
}

function relevantCount(test, titles = []) {
  return titles.filter((title) => test.relevance_terms.some((term) => containsTerm(title, term))).length;
}

function firstRelevant(test, titles = []) {
  return Boolean(titles[0] && test.relevance_terms.some((term) => containsTerm(titles[0], term)));
}

function scoreSearch(test, result) {
  if (result.blocked || result.result_count === null || result.result_count === undefined) {
    if (!result.product_titles?.length) return null;
  }
  if (result.result_count === 0 && !result.product_titles?.length) return 0;
  const relevant = relevantCount(test, result.product_titles || []);
  let score = 62;
  if ((result.product_titles || []).length > 0) score += 8;
  if (firstRelevant(test, result.product_titles || [])) score += 12;
  if (relevant >= 3) score += 12;
  else if (relevant > 0) score += 6;
  if ((result.result_count || 0) > 0 && result.result_count <= 250) score += 6;
  if ((result.result_count || 0) > 500) score -= 6;
  return Math.max(0, Math.min(100, score));
}

function scoreAutocomplete(test, result) {
  if (!result.ok || result.status !== 200) return null;
  const products = result.products || [];
  const collections = result.collections || [];
  const queries = result.queries || [];
  const pages = result.pages || [];
  if (!products.length && !collections.length && !queries.length && !pages.length) return 0;
  if (!products.length) return collections.length || queries.length || pages.length ? 62 : 55;
  const relevant = relevantCount(test, products);
  let score = 66;
  if (firstRelevant(test, products)) score += 14;
  if (relevant >= 2) score += 10;
  else if (relevant > 0) score += 5;
  if (collections.length || queries.length || pages.length) score += 5;
  return Math.max(0, Math.min(100, score));
}

function band(score) {
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

function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

async function collectSearch(page, test) {
  const url = searchUrl(test.query);
  let lastResult = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(900);
      const status = response?.status() || null;
      const title = await page.title();
      const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      const productTitles = await page
        .locator('a[href*="/products/"]')
        .evaluateAll((anchors) => anchors
          .map((anchor) => anchor.textContent || '')
          .map((text) => text.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 10))
        .catch(() => []);
      const resultCount = searchResultCount(title, text);
      const blocked = isBlocked(title, text, status) || (resultCount === null && productTitles.length === 0);
      lastResult = {
        url,
        status,
        title,
        result_count: resultCount,
        blocked,
        product_titles: unique(productTitles.map(compactTitle).filter(Boolean)).slice(0, 8),
        text_excerpt: compactExcerpt(text, 1000)
      };
      if (!lastResult.blocked || attempt === 3) return lastResult;
      await sleep(3000 * attempt);
    } catch (error) {
      lastResult = {
        url,
        status: null,
        title: '',
        result_count: null,
        blocked: true,
        error: error.message,
        product_titles: []
      };
      await sleep(3000 * attempt);
    }
  }
  return lastResult;
}

async function collectSuggestOnce(page, test) {
  return page.evaluate(async (query) => {
    const url = `/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query,page&resources[limit]=8`;
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
      products: (resources.products || []).map((item) => item.title).filter(Boolean).slice(0, 8),
      collections: (resources.collections || []).map((item) => item.title).filter(Boolean).slice(0, 8),
      queries: (resources.queries || []).map((item) => item.text).filter(Boolean).slice(0, 8),
      pages: (resources.pages || []).map((item) => item.title).filter(Boolean).slice(0, 8)
    };
  }, test.query);
}

async function collectSuggest(page, test) {
  let lastResult = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = await collectSuggestOnce(page, test);
    if (lastResult.status !== 429 || attempt === 3) return lastResult;
    await sleep(3000 * attempt);
  }
  return lastResult;
}

function searchNote(result) {
  if (result.blocked) return 'Rendered search was blocked or unverified; do not treat as zero results.';
  if (result.result_count === 0) return 'Rendered search produced zero results.';
  const products = (result.product_titles || []).slice(0, 2).join('; ') || 'no product titles captured';
  return `${result.result_count ?? 'unknown count'} rendered results; sample: ${products}`;
}

function autocompleteNote(result) {
  if (!result.ok) return `Suggest API status ${result.status}; not verified.`;
  const parts = [];
  if (result.products?.length) parts.push(`products: ${result.products.slice(0, 2).join('; ')}`);
  if (result.collections?.length) parts.push(`collections: ${result.collections.slice(0, 2).join('; ')}`);
  if (result.queries?.length) parts.push(`queries: ${result.queries.slice(0, 2).join('; ')}`);
  if (result.pages?.length) parts.push(`pages: ${result.pages.slice(0, 2).join('; ')}`);
  return parts.length ? parts.join(' | ') : 'no product, collection, query, or page suggestions';
}

async function evaluateTest(page, test, concept) {
  const search = await collectSearch(page, test);
  const autocomplete = await collectSuggest(page, test);
  const searchScore = scoreSearch(test, search);
  const autocompleteScore = scoreAutocomplete(test, autocomplete);
  return {
    concept,
    query: test.query,
    intent: test.intent,
    reason: test.reason,
    relevance_terms: test.relevance_terms,
    search_score: searchScore,
    search_band: band(searchScore),
    autocomplete_score: autocompleteScore,
    autocomplete_band: band(autocompleteScore),
    uniform_experience: Number.isFinite(searchScore) && Number.isFinite(autocompleteScore) && searchScore >= 75 && autocompleteScore >= 75,
    search,
    autocomplete,
    evidence_note: `${searchNote(search)} / ${autocompleteNote(autocomplete)}`
  };
}

async function collectSearchCompetitor(page, competitor, query) {
  const url = competitor.searchUrl(query);
  let lastResult = null;
  for (let attempt = 1; attempt <= COMPETITOR_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(1000);
      const status = response?.status() || null;
      const title = await page.title();
      const text = await page.locator('body').innerText({ timeout: 7000 }).catch(() => '');
      const productLinks = await page
        .locator('a[href*="/products/"], a[href*="/product/"]')
        .evaluateAll((anchors) => anchors
          .map((anchor) => anchor.textContent || anchor.getAttribute('aria-label') || '')
          .map((text) => text.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 12))
        .catch(() => []);
      const sponsoredTerms = ['sponsored', 'promoted', 'ad ', 'advertisement', 'paid'];
      const foundSponsoredTerms = sponsoredTerms.filter((term) => normalize(text).includes(normalize(term)));
      const blocked = isBlocked(title, text, status) || productLinks.length === 0;
      lastResult = {
        query,
        url,
        status,
        title,
        blocked,
        product_link_count: productLinks.length,
        product_titles: unique(productLinks.map(compactTitle)).slice(0, 8),
        sponsored_terms_found: foundSponsoredTerms,
        sponsored_label_visible: foundSponsoredTerms.length > 0,
        organic_sponsored_interpretation: foundSponsoredTerms.length
          ? `Visible paid-placement-like labels found: ${foundSponsoredTerms.join(', ')}.`
          : 'No visible paid-placement label in rendered text; not proof none exists.'
      };
      if (!blocked || attempt === COMPETITOR_MAX_ATTEMPTS) break;
      await sleep(COMPETITOR_RETRY_BACKOFF_MS * attempt);
    } catch (error) {
      lastResult = {
        query,
        url,
        status: null,
        title: '',
        blocked: true,
        product_link_count: 0,
        product_titles: [],
        sponsored_terms_found: [],
        sponsored_label_visible: false,
        organic_sponsored_interpretation: 'No visible paid-placement label in rendered text; not proof none exists.',
        error: error.message
      };
      await sleep(COMPETITOR_RETRY_BACKOFF_MS * attempt);
    }
  }
  return lastResult;
}

async function collectCompetitorSuggest(browser, competitor, test) {
  const page = await browser.newPage();
  try {
    await page.goto(competitor.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const result = await collectSuggest(page, test);
    await page.close();
    return result;
  } catch (error) {
    await page.close();
    return { status: null, ok: false, error: error.message, products: [], collections: [], queries: [], pages: [] };
  }
}

function scoreCompetitorSearch(test, result) {
  if (!result || result.blocked || !result.product_link_count) return null;
  const relevant = relevantCount(test, result.product_titles || []);
  let score = 64;
  if (result.product_link_count >= 4) score += 10;
  if (firstRelevant(test, result.product_titles || [])) score += 12;
  if (relevant >= 3) score += 10;
  else if (relevant > 0) score += 5;
  return Math.max(0, Math.min(100, score));
}

async function collectCompetitorQueryBenchmark(browser, tests) {
  const sites = [];
  for (const competitor of COMPETITORS) {
    console.error(`collecting competitor benchmark: ${competitor.name}`);
    const searchPage = await browser.newPage();
    const suggestPage = await browser.newPage();
    let suggestReady = true;
    try {
      await suggestPage.goto(competitor.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
      suggestReady = false;
    }
    const runs = [];
    for (const test of tests) {
      const search = await collectSearchCompetitor(searchPage, competitor, test.query);
      const autocomplete = suggestReady
        ? await collectSuggest(suggestPage, test).catch((error) => ({ status: null, ok: false, error: error.message, products: [], collections: [], queries: [], pages: [] }))
        : { status: null, ok: false, error: 'competitor_homepage_unavailable_for_suggest_context', products: [], collections: [], queries: [], pages: [] };
      const searchScore = scoreCompetitorSearch(test, search);
      const autocompleteScore = scoreAutocomplete(test, autocomplete);
      runs.push({
        site: competitor.name,
        concept: test.concept,
        query: test.query,
        intent: test.intent,
        search_score: searchScore,
        search_band: band(searchScore),
        autocomplete_score: autocompleteScore,
        autocomplete_band: band(autocompleteScore),
        search,
        autocomplete,
        evidence_note: `${search?.product_link_count || 0} product-like links; sample: ${(search?.product_titles || []).slice(0, 2).join('; ') || 'none'} / ${autocompleteNote(autocomplete)}`
      });
      await sleep(COMPETITOR_QUERY_DELAY_MS);
    }
    await searchPage.close();
    await suggestPage.close();
    const conceptSummaries = TEST_GROUPS.map((testGroup) => {
      const conceptRuns = runs.filter((run) => run.concept === testGroup.concept);
      return {
        concept: testGroup.concept,
        query_count: conceptRuns.length,
        search_average: average(conceptRuns.map((run) => run.search_score)),
        autocomplete_average: average(conceptRuns.map((run) => run.autocomplete_score)),
        usable_search_count: conceptRuns.filter((run) => Number.isFinite(run.search_score)).length,
        autocomplete_available_count: conceptRuns.filter((run) => Number.isFinite(run.autocomplete_score)).length
      };
    });
    sites.push({
      name: competitor.name,
      classification: competitor.classification,
      source_url: competitor.source_url,
      overlap: competitor.overlap,
      query_count: runs.length,
      usable_search_count: runs.filter((run) => Number.isFinite(run.search_score)).length,
      autocomplete_available_count: runs.filter((run) => Number.isFinite(run.autocomplete_score)).length,
      search_average: average(runs.map((run) => run.search_score)),
      autocomplete_average: average(runs.map((run) => run.autocomplete_score)),
      visible_paid_label_count: runs.filter((run) => run.search?.sponsored_label_visible).length,
      sponsored_interpretation: 'Paid-placement labels are recorded only when visible in rendered text; absence of labels is not proof none exist.',
      concept_summaries: conceptSummaries,
      runs
    });
  }
  return { sites, generated_at: new Date().toISOString() };
}

function flattenTests() {
  return TEST_GROUPS.flatMap((testGroup) => testGroup.tests.map((test) => ({ ...test, concept: testGroup.concept })));
}

async function collectEvidence() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const examples = [];
  for (const testGroup of TEST_GROUPS) {
    console.error(`collecting target concept: ${testGroup.concept}`);
    for (const test of testGroup.tests) {
      examples.push(await evaluateTest(page, test, testGroup.concept));
      await sleep(REQUEST_DELAY_MS);
    }
  }
  const competitorQueryBenchmark = await collectCompetitorQueryBenchmark(browser, flattenTests());
  await browser.close();
  return { examples, competitor_query_benchmark: competitorQueryBenchmark };
}

function summarizeConcept(testGroup, examples) {
  const rows = examples.filter((example) => example.concept === testGroup.concept);
  return {
    concept: testGroup.concept,
    executive_explanation: testGroup.executive_explanation,
    why_it_matters: testGroup.why_it_matters,
    example_count: rows.length,
    search_average: average(rows.map((row) => row.search_score)),
    autocomplete_average: average(rows.map((row) => row.autocomplete_score)),
    uniform_rate: percent(rows.filter((row) => row.uniform_experience).length, rows.length),
    representative_gaps: rows
      .filter((row) => (row.search_score || 0) >= 75 && (row.autocomplete_score || 0) < 75)
      .slice(0, 3)
      .map((row) => row.query)
  };
}

function buildEvidence(collected) {
  const examples = collected.examples;
  const concepts = TEST_GROUPS.map((testGroup) => summarizeConcept(testGroup, examples));
  const searchScores = examples.map((example) => example.search_score);
  const autocompleteScores = examples.map((example) => example.autocomplete_score);
  const strongSearch = examples.filter((example) => (example.search_score || 0) >= 75);
  const strongAutocomplete = examples.filter((example) => (example.autocomplete_score || 0) >= 75);
  const spanish = examples.filter((example) => example.concept === 'Spanish/Bilingual Discovery');
  return {
    project_id: 'ecommmerce-eval',
    generation: GEN,
    target: {
      name: TARGET_NAME,
      url: TARGET,
      domain: TARGET_DOMAIN,
      platform_indicators: [
        'Shopify-style search/suggest.json available',
        'Rendered search pages available',
        'Public navigation exposes dresses, tops, denim, shoes, accessories, sale, game day, bridal, and city custom collections'
      ]
    },
    methodology: {
      generated_at: new Date().toISOString(),
      examples_per_concept: TEST_GROUPS[0].tests.length,
      concept_count: TEST_GROUPS.length,
      total_examples: examples.length,
      scoring_note: 'Scores are bounded public-evidence proxies from rendered search, product-like links, query-term matches, and public suggest responses. They are not calibrated relevance judgments.',
      competitor_note: 'Comparable boutique sites are reference implementations, not winners. Same-query evidence supports opportunity framing only.'
    },
    summary: {
      total_examples: examples.length,
      search_average: average(searchScores),
      autocomplete_average: average(autocompleteScores),
      strong_search_rate: percent(strongSearch.length, examples.length),
      strong_autocomplete_rate: percent(strongAutocomplete.length, examples.length),
      no_autocomplete_rate: percent(examples.filter((example) => example.autocomplete_score === 0).length, examples.length),
      uniform_experience_rate: percent(examples.filter((example) => example.uniform_experience).length, examples.length),
      search_strong_autocomplete_weak_count: examples.filter((example) => (example.search_score || 0) >= 75 && (example.autocomplete_score || 0) < 75).length,
      spanish_bilingual_search_average: average(spanish.map((example) => example.search_score)),
      spanish_bilingual_autocomplete_average: average(spanish.map((example) => example.autocomplete_score))
    },
    concepts,
    examples,
    competitor_query_benchmark: collected.competitor_query_benchmark,
    evidence_limits: [
      'Public evidence only: no analytics, revenue, customer records, admin data, search logs, checkout completion, or paid-media data.',
      'Autocomplete is measured through public suggest responses, not full visual dropdown QA across every desktop and mobile state.',
      'Competitor checks record visible paid-placement labels only; absence of a label is not proof that results are organic-only.',
      'The query set is a diagnostic boutique-apparel sample, not a calibrated relevance benchmark with expected product-level judgments.',
      'Dollar impact should be estimated using Dress Up search logs, product-page reach, add-to-cart rate, conversion, average order value, and margin data.'
    ]
  };
}

function escapeLatex(value = '') {
  return String(value)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function markdownTableRow(values = []) {
  return `| ${values.map((value) => String(value).replace(/\|/g, '/')).join(' | ')} |`;
}

function percentValue(value) {
  return Number.isFinite(value) ? `${value}%` : 'Unverified';
}

function latexPercentValue(value) {
  return Number.isFinite(value) ? `${value}\\%` : 'Unverified';
}

function cleanReportTokens(values = []) {
  const tokens = [];
  for (const value of values) {
    const parts = String(value || '').split(/;|\n/);
    for (const part of parts) {
      const text = compactTitle(part).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (/function\b|window\.|document\.|getAttribute|altFixApplied|var\s+|return\b/i.test(text)) continue;
      if (text.length > 120 && /[{}()]/.test(text)) continue;
      tokens.push(text.slice(0, 90));
    }
  }
  return unique(tokens).slice(0, 2);
}

function reportAutocompleteNote(autocomplete) {
  if (!autocomplete) return 'suggest evidence unavailable';
  const products = cleanReportTokens(autocomplete.products || []);
  const collections = cleanReportTokens(autocomplete.collections || []);
  const queries = cleanReportTokens(autocomplete.queries || []);
  const pages = cleanReportTokens(autocomplete.pages || []);
  const parts = [];
  if (products.length) parts.push(`products: ${products.join('; ')}`);
  if (collections.length) parts.push(`collections: ${collections.join('; ')}`);
  if (queries.length) parts.push(`queries: ${queries.join('; ')}`);
  if (pages.length) parts.push(`pages: ${pages.join('; ')}`);
  return parts.length ? parts.join(' / ') : 'no product, collection, query, or page suggestions';
}

function competitorEvidenceNoteForReport(run) {
  const searchCount = Number.isFinite(run.search?.product_link_count) ? run.search.product_link_count : 0;
  const sample = cleanReportTokens(run.search?.product_titles || []).join('; ') || 'none';
  return `${searchCount} product-like links; sample: ${sample} / ${reportAutocompleteNote(run.autocomplete)}`;
}

function targetBenchmarkRow(evidence) {
  return {
    name: TARGET_NAME,
    query_count: evidence.examples.length,
    usable_search_count: evidence.examples.filter((row) => Number.isFinite(row.search_score)).length,
    search_average: evidence.summary.search_average,
    autocomplete_available_count: evidence.examples.filter((row) => Number.isFinite(row.autocomplete_score)).length,
    autocomplete_average: evidence.summary.autocomplete_average,
    visible_paid_label_count: 'N/A'
  };
}

function benchmarkRows(evidence) {
  return [targetBenchmarkRow(evidence), ...(evidence.competitor_query_benchmark?.sites || [])];
}

function targetConceptBenchmarkRows(evidence) {
  return evidence.concepts.map((summary) => {
    const conceptRows = evidence.examples.filter((row) => row.concept === summary.concept);
    return {
      site: TARGET_NAME,
      concept: summary.concept,
      search_average: summary.search_average,
      autocomplete_average: summary.autocomplete_average,
      usable_search_count: conceptRows.filter((row) => Number.isFinite(row.search_score)).length,
      autocomplete_available_count: conceptRows.filter((row) => Number.isFinite(row.autocomplete_score)).length
    };
  });
}

function buildReportJson(evidence) {
  const competitorSites = evidence.competitor_query_benchmark?.sites || [];
  return {
    report_id: 'dressup-ecommerce-executive-report',
    generation: GEN,
    target: evidence.target,
    generated_at: evidence.methodology.generated_at,
    executive_positioning: {
      goal: 'Help Dress Up leadership see that the online store already has a strong boutique shopping foundation and a focused opportunity to make product finding easier earlier in the customer journey.',
      outreach_readiness: 'Suitable as an executive conversation starter because the opening pages lead with customer experience and keep the technical experiment detail in references.',
      competitor_context: {
        status: competitorSites.length ? 'same_query_peer_reference_available' : 'not_available',
        target_baseline: {
          name: TARGET_NAME,
          search_average: evidence.summary.search_average,
          autocomplete_average: evidence.summary.autocomplete_average,
          interpretation: 'Current-site baseline for comparison against peer reference implementations.'
        },
        sites: competitorSites.map((site) => ({
          name: site.name,
          search_average: site.search_average,
          autocomplete_average: site.autocomplete_average,
          interpretation: 'Reference implementation only; not a market-share or superiority claim.'
        }))
      }
    },
    summary: evidence.summary,
    concepts: evidence.concepts,
    competitor_query_benchmark: evidence.competitor_query_benchmark,
    evidence_limits: evidence.evidence_limits
  };
}

function topGaps(evidence) {
  return evidence.examples
    .filter((example) => (example.search_score || 0) >= 75 && (example.autocomplete_score || 0) < 75)
    .sort((a, b) => (a.autocomplete_score || 0) - (b.autocomplete_score || 0))
    .slice(0, 14);
}

function buildMarkdown(evidence) {
  const lines = [];
  lines.push(`# ${TARGET_NAME} Online Customer Experience Opportunity Report`);
  lines.push('');
  lines.push('Dress Up already gives shoppers a broad boutique shopping foundation across dresses, tops, denim, accessories, seasonal collections, game day, bridal, sale, and city custom paths. The opportunity is reducing effort earlier in product finding so more shoppers reach relevant products quickly and confidently.');
  lines.push('');
  lines.push('## Executive Readout');
  lines.push('');
  lines.push('- Dress Up was selected because it already has a mature ecommerce foundation and enough category depth for targeted improvements to matter.');
  lines.push('- Public experiments suggest shoppers can generally find products after submitting searches, while some early product-finding guidance can be made more consistent.');
  lines.push('- The review included same-query peer analysis against comparable boutique retailers, using those results as reference examples rather than a competitor ranking.');
  lines.push('- Business value should be measured with internal search behavior, product-page reach, add-to-cart rate, conversion, average order value, and margin data.');
  lines.push('');
  lines.push('## Concept Results Summary');
  lines.push(markdownTableRow(['Concept', 'Search avg', 'Autocomplete avg', 'Uniform', 'Representative gaps']));
  lines.push(markdownTableRow(['---', '---:', '---:', '---:', '---']));
  for (const concept of evidence.concepts) {
    lines.push(markdownTableRow([
      concept.concept,
      percentValue(concept.search_average),
      percentValue(concept.autocomplete_average),
      percentValue(concept.uniform_rate),
      concept.representative_gaps.join('; ') || 'None in top sample'
    ]));
  }
  lines.push('');
  lines.push('## Highest-Priority Early Guidance Gaps');
  lines.push(markdownTableRow(['Concept', 'Query', 'Intent', 'Search', 'Autocomplete', 'Evidence note']));
  lines.push(markdownTableRow(['---', '---', '---', '---:', '---:', '---']));
  for (const row of topGaps(evidence)) {
    lines.push(markdownTableRow([row.concept, row.query, row.intent, row.search_score, row.autocomplete_score, row.evidence_note]));
  }
  lines.push('');
  lines.push('## Same-Query Competitor Benchmark');
  lines.push('Comparable boutique retailers were checked with the same public query set where rendered access and public suggest endpoints were available. These are reference examples, not proof of market position.');
  lines.push(markdownTableRow(['Site', 'Queries', 'Search usable', 'Search avg', 'Autocomplete usable', 'Autocomplete avg', 'Paid labels visible']));
  lines.push(markdownTableRow(['---', '---:', '---:', '---:', '---:', '---:', '---:']));
  for (const site of benchmarkRows(evidence)) {
    lines.push(markdownTableRow([site.name, site.query_count, site.usable_search_count, percentValue(site.search_average), site.autocomplete_available_count, percentValue(site.autocomplete_average), site.visible_paid_label_count]));
  }
  lines.push('');
  lines.push('## Full Query Dataset');
  lines.push(markdownTableRow(['Concept', 'Query', 'Intent', 'Search', 'Autocomplete', 'Evidence note']));
  lines.push(markdownTableRow(['---', '---', '---', '---:', '---:', '---']));
  for (const row of evidence.examples) {
    lines.push(markdownTableRow([row.concept, row.query, row.intent, row.search_score ?? 'unverified', row.autocomplete_score ?? 'unverified', row.evidence_note]));
  }
  lines.push('');
  lines.push('## Evidence Limits');
  for (const limit of evidence.evidence_limits) {
    lines.push(`- ${limit}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function conceptRows(evidence) {
  return evidence.concepts.map((row) => (
    `${escapeLatex(row.concept)} & ${latexPercentValue(row.search_average)} & ${latexPercentValue(row.autocomplete_average)} & ${latexPercentValue(row.uniform_rate)} & ${escapeLatex(row.representative_gaps.join('; ') || 'None in top sample')}\\\\`
  )).join('\n');
}

function topGapRows(evidence) {
  return topGaps(evidence).map((row) => (
    `${escapeLatex(row.concept)} & ${escapeLatex(row.query)} & ${row.search_score ?? '--'} & ${row.autocomplete_score ?? '--'} & ${escapeLatex(row.evidence_note)}\\\\`
  )).join('\n');
}

function referenceRows(evidence) {
  return evidence.examples.map((row) => (
    `${escapeLatex(row.concept)} & ${escapeLatex(row.query)} & ${escapeLatex(row.intent)} & ${row.search_score ?? '--'} & ${row.autocomplete_score ?? '--'} & ${escapeLatex(row.evidence_note)}\\\\`
  )).join('\n');
}

function competitorSiteRows(evidence) {
  return benchmarkRows(evidence).map((site) => (
    `${escapeLatex(site.name)} & ${site.query_count} & ${site.usable_search_count} & ${latexPercentValue(site.search_average)} & ${site.autocomplete_available_count} & ${latexPercentValue(site.autocomplete_average)} & ${site.visible_paid_label_count}\\\\`
  )).join('\n');
}

function competitorConceptRows(evidence) {
  const targetRows = targetConceptBenchmarkRows(evidence).map((summary) => (
    `${escapeLatex(summary.site)} & ${escapeLatex(summary.concept)} & ${latexPercentValue(summary.search_average)} & ${latexPercentValue(summary.autocomplete_average)} & ${summary.usable_search_count} & ${summary.autocomplete_available_count}\\\\`
  ));
  const peerRows = (evidence.competitor_query_benchmark?.sites || []).flatMap((site) => (
    (site.concept_summaries || []).map((summary) => (
      `${escapeLatex(site.name)} & ${escapeLatex(summary.concept)} & ${latexPercentValue(summary.search_average)} & ${latexPercentValue(summary.autocomplete_average)} & ${summary.usable_search_count} & ${summary.autocomplete_available_count}\\\\`
    ))
  ));
  return [...targetRows, ...peerRows].join('\n');
}

function competitorFullRows(evidence) {
  return (evidence.competitor_query_benchmark?.sites || []).flatMap((site) => (
    (site.runs || []).map((run) => (
      `${escapeLatex(site.name)} & ${escapeLatex(run.concept)} & ${escapeLatex(run.query)} & ${run.search_score ?? '--'} & ${run.autocomplete_score ?? '--'} & ${escapeLatex(competitorEvidenceNoteForReport(run))}\\\\`
    ))
  )).join('\n');
}

function buildLatex(evidence) {
  const topGapSummary = topGaps(evidence).slice(0, 3).map((row) => row.query).join(', ') || 'priority shopper journeys';
  return `\\documentclass[10pt]{article}

\\newcommand{\\NorthvalleyAssetPath}{northvalley-template-assets}
\\input{northvalley-template-assets/northvalley-brand.sty}
\\usepackage[letterpaper,margin=0.62in,top=0.62in,bottom=0.72in]{geometry}
\\usepackage{booktabs}
\\usepackage{longtable}
\\usepackage[hidelinks]{hyperref}

\\renewcommand{\\familydefault}{\\sfdefault}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\hyphenpenalty=10000
\\exhyphenpenalty=10000
\\emergencystretch=0.14in

\\newcommand{\\ReportTitle}{Dress Up Online Customer Experience Opportunity}
\\newcommand{\\ReportClient}{Dress Up Leadership Team}
\\newcommand{\\ReportDate}{July 6, 2026}
\\newcommand{\\ReportSummary}{Executive conversation starter on making it easier for shoppers to find and buy boutique apparel online, supported by public observations, same-query peer analysis, and reference evidence.}
\\newcommand{\\ReportPreparedBy}{Northvalley Intelligence LLC}

\\definecolor{NVIAmberSoft}{HTML}{FFF4D8}
\\definecolor{NVIGreenSoft}{HTML}{E2F1ED}

\\newcommand{\\Good}[1]{\\textcolor{NVIAccentDark}{\\textbf{#1}}}
\\newcommand{\\Warn}[1]{\\textcolor{NVIWarning}{\\textbf{#1}}}
\\newcommand{\\ReportKicker}[1]{{\\fontsize{7.7}{9}\\selectfont\\bfseries\\color{NVIAccent}\\MakeUppercase{#1}}}
\\newcommand{\\ReportBody}[1]{{\\fontsize{9.35}{11.45}\\selectfont\\color{NVIInk}#1}}
\\newcommand{\\ReportFine}[1]{{\\fontsize{7.45}{8.9}\\selectfont\\color{NVIMuted}#1}}
\\newcommand{\\CustomerEffortVisual}{%
  \\resizebox{\\linewidth}{!}{%
  \\begin{tikzpicture}[x=1in,y=1in]
    \\path[use as bounding box] (0,0) rectangle (8.55,3.45);
    \\draw[draw=NVIRule,fill=NVIPanel,rounded corners=2pt] (0,0) rectangle (8.55,3.45);
    \\node[anchor=west,font=\\fontsize{7.9}{9.4}\\selectfont\\bfseries,text=NVIAccent] at (0.22,3.20) {CUSTOMER EFFORT REDUCTION MODEL};
    \\node[anchor=east,font=\\fontsize{7.1}{8.4}\\selectfont,text=NVIMuted] at (8.31,3.20) {Where the first 90 days should focus};
    \\node[anchor=west,font=\\fontsize{7.1}{8.4}\\selectfont\\bfseries,text=NVIMuted] at (0.30,2.68) {Customer works harder};
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (needA) at (1.35,2.22) {Occasion or style need};
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (guideA) at (3.15,2.22) {Limited early guidance};
    \\node[draw=NVIWarning,fill=NVIAmberSoft,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (refineA) at (4.95,2.22) {Extra refinements};
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.52in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (pathA) at (6.75,2.22) {Product path};
    \\draw[->,line width=0.8pt,color=NVIMuted] (needA.east) -- (guideA.west);
    \\draw[->,line width=0.8pt,color=NVIMuted] (guideA.east) -- (refineA.west);
    \\draw[->,line width=0.8pt,color=NVIMuted] (refineA.east) -- (pathA.west);
    \\node[anchor=west,font=\\fontsize{7.1}{8.4}\\selectfont\\bfseries,text=NVIAccent] at (0.30,1.50) {First 90 days: reduce early effort};
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.54in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (needB) at (1.35,1.02) {Occasion or style need};
    \\node[draw=NVIAccent,fill=NVIGreenSoft,rounded corners=2pt,text width=1.44in,minimum height=0.54in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIAccentDark] (guideB) at (3.25,1.02) {Earlier guidance};
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.54in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (pathB) at (5.25,1.02) {Relevant style path};
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,text width=1.28in,minimum height=0.54in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIInk] (buyB) at (7.15,1.02) {Confidence to buy};
    \\draw[->,line width=0.9pt,color=NVIAccentDark] (needB.east) -- (guideB.west);
    \\draw[->,line width=0.9pt,color=NVIAccentDark] (guideB.east) -- (pathB.west);
    \\draw[->,line width=0.9pt,color=NVIAccentDark] (pathB.east) -- (buyB.west);
    \\draw[->,line width=0.95pt,color=NVIAccent] (guideA.south) -- (guideB.north);
    \\node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=2.42in,align=center,font=\\fontsize{7.0}{8.4}\\selectfont\\bfseries,text=NVIAccentDark] at (3.25,0.32) {Occasions, fit, color, customer wording, and bilingual needs};
    \\node[anchor=west,font=\\fontsize{7.0}{8.4}\\selectfont,text=NVIMuted] at (5.00,0.32) {Measure: product-page reach, add-to-cart, conversion, and order value.};
  \\end{tikzpicture}%
  }%
}
\\newcommand{\\ExecutiveDecisionStrip}{%
  \\resizebox{\\linewidth}{!}{%
  \\begin{tikzpicture}[x=1in,y=1in]
    \\path[use as bounding box] (0,0) rectangle (8.55,0.95);
    \\draw[draw=NVIAccentDark,fill=NVIAccentDark,rounded corners=2pt] (0,0) rectangle (8.55,0.95);
    \\node[anchor=west,font=\\fontsize{7.6}{9.0}\\selectfont\\bfseries,text=NVIAccentSoft] at (0.25,0.72) {EXECUTIVE DECISION FOCUS};
    \\node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=1.55in,minimum height=0.36in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIAccentDark] at (2.05,0.33) {Priority journeys};
    \\node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=1.55in,minimum height=0.36in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIAccentDark] at (4.30,0.33) {Early guidance pilots};
    \\node[draw=NVIAccent,fill=white,rounded corners=2pt,text width=1.55in,minimum height=0.36in,align=center,font=\\fontsize{7.0}{8.2}\\selectfont\\bfseries,text=NVIAccentDark] at (6.55,0.33) {Impact measurement};
  \\end{tikzpicture}%
  }%
}

\\newcommand{\\ReportPageHeader}[1]{%
  \\begin{tikzpicture}[remember picture,overlay]
    \\fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-0.46in]current page.north east);
    \\fill[NVIAccent] ([yshift=-0.46in]current page.north west) rectangle ([yshift=-0.49in]current page.north east);
    \\node[anchor=west,text=white,font=\\fontsize{8.4}{9.8}\\selectfont\\bfseries]
      at ([xshift=0.62in,yshift=-0.23in]current page.north west) {#1};
    \\node[anchor=east,text=white,font=\\fontsize{7.4}{8.6}\\selectfont]
      at ([xshift=-0.62in,yshift=-0.23in]current page.north east) {\\ReportClient};
  \\end{tikzpicture}
  \\vspace*{0.22in}
}
\\newcommand{\\ReportFooter}{%
  \\begin{tikzpicture}[remember picture,overlay]
    \\fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.34in]current page.south east);
    \\node[anchor=west,text=white,font=\\fontsize{7.2}{8.4}\\selectfont]
      at ([xshift=0.62in,yshift=0.17in]current page.south west) {\\NorthvalleyContactLine};
    \\node[anchor=east,text=white,font=\\fontsize{7.2}{8.4}\\selectfont]
      at ([xshift=-0.62in,yshift=0.17in]current page.south east) {\\thepage};
  \\end{tikzpicture}
}
\\newcommand{\\ReportSection}[1]{%
  \\vspace{0.10in}
  {\\fontsize{15}{18}\\selectfont\\bfseries\\color{NVIInk}#1}\\\\[-0.02in]
  {\\color{NVIAccent}\\rule{\\linewidth}{0.8pt}}
  \\vspace{0.07in}
}
\\newcommand{\\ReportCard}[2]{%
  \\begin{tikzpicture}
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,inner xsep=11pt,inner ysep=9pt,text width=\\dimexpr\\linewidth-24pt\\relax,align=left]
      {\\ReportKicker{#1}\\\\[0.05in]\\ReportBody{#2}};
  \\end{tikzpicture}
}
\\newcommand{\\ReportDarkCard}[2]{%
  \\begin{tikzpicture}
    \\node[draw=NVIAccentDark,fill=NVIAccentDark,rounded corners=2pt,inner xsep=12pt,inner ysep=10pt,text width=\\dimexpr\\linewidth-26pt\\relax,align=left]
      {{\\fontsize{7.7}{9}\\selectfont\\bfseries\\color{NVIAccentSoft}\\MakeUppercase{#1}}\\\\[0.06in]{\\fontsize{10.2}{12.4}\\selectfont\\color{white}#2}};
  \\end{tikzpicture}
}
\\newcommand{\\MetricCard}[3]{%
  \\begin{tikzpicture}
    \\node[draw=NVIRule,fill=NVIPanel,rounded corners=2pt,inner xsep=9pt,inner ysep=8pt,text width=\\dimexpr\\linewidth-20pt\\relax,minimum height=0.88in,align=left]
      {\\ReportKicker{#1}\\\\[0.04in]{\\fontsize{18}{21}\\selectfont\\bfseries\\color{NVIAccentDark}#2}\\\\[0.02in]\\ReportFine{#3}};
  \\end{tikzpicture}
}

\\begin{document}
\\color{NVIInk}
\\hypersetup{pageanchor=false}

\\begin{titlepage}
\\thispagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[NVIPanel] (current page.north west) rectangle (current page.south east);
  \\fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-1.05in]current page.north east);
  \\fill[NVIAccent] ([yshift=-1.05in]current page.north west) rectangle ([yshift=-1.10in]current page.north east);
  \\fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.45in]current page.south east);
  \\node[anchor=west,text=white,font=\\fontsize{9.3}{11}\\selectfont\\bfseries]
    at ([xshift=0.62in,yshift=-0.52in]current page.north west) {\\NorthvalleyBusinessName};
  \\node[anchor=east,text=white,font=\\fontsize{7.6}{9}\\selectfont]
    at ([xshift=-0.62in,yshift=-0.52in]current page.north east) {\\ReportDate};
  \\node[anchor=west,text=white,font=\\fontsize{7.2}{8.4}\\selectfont]
    at ([xshift=0.62in,yshift=0.22in]current page.south west) {\\NorthvalleyContactLine};
\\end{tikzpicture}

\\vspace*{1.08in}
\\begin{minipage}[t]{0.60\\linewidth}
\\raggedright
\\ReportKicker{Customer Experience Review}\\\\[0.12in]
{\\fontsize{31}{36}\\selectfont\\bfseries\\color{NVIInk}\\ReportTitle}\\par
\\vspace{0.20in}
{\\fontsize{12.1}{14.6}\\selectfont\\color{NVIInk}\\ReportSummary}\\par
\\vspace{0.30in}
{\\color{NVIAccent}\\rule{2.6in}{0.9pt}}\\par
\\vspace{0.18in}
{\\fontsize{9.2}{11}\\selectfont\\color{NVIMuted}Prepared for}\\\\[-0.01in]
{\\fontsize{15}{18}\\selectfont\\bfseries\\color{NVIAccentDark}\\ReportClient}\\par
\\vspace{0.08in}
{\\fontsize{9}{10.8}\\selectfont\\color{NVIMuted}Prepared by \\ReportPreparedBy}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.31\\linewidth}
\\centering
\\vspace{0.10in}
\\NorthvalleyLogo[0.88in]\\par
\\vspace{0.22in}
\\ReportDarkCard{Primary Readout}{Dress Up already has a strong online boutique shopping foundation. The opportunity is helping shoppers reach the right styles faster and with less effort.}
\\vspace{0.11in}
\\MetricCard{Evidence Base}{Public}{Detailed experiments, methodology, and peer references remain in the appendix.}
\\end{minipage}
\\end{titlepage}
\\hypersetup{pageanchor=true}
\\setcounter{page}{1}

\\ReportPageHeader{Executive Readout}
\\ReportFooter
\\ReportSection{Executive Readout}
\\begin{minipage}[t]{0.62\\linewidth}
\\ReportDarkCard{Customer Buying Experience Opportunity}{Dress Up already provides a broad online boutique experience across dresses, tops, denim, shoes, accessories, seasonal collections, game day, bridal, sale, and city custom paths. The opportunity is to reduce customer effort before shoppers reach the style they intend to buy.}
\\vspace{0.12in}
\\ReportBody{We periodically review regional and online retailers to identify practical opportunities for improving the customer experience. \\textbf{Dress Up was selected because it already has a strong ecommerce foundation}. Mature retailers often benefit most from targeted improvements that make shopping faster, easier, and more confidence-building for customers.}\\par
\\vspace{0.08in}
\\ReportKicker{Why This Matters}\\\\[0.03in]
\\ReportBody{Comparable online boutique retailers were reviewed with the same shopper-language examples used for Dress Up. These peer references help show alternative ways customers can be guided during the earliest moments of shopping, while keeping the executive takeaway favorable for Dress Up: shoppers already encounter a strong online boutique foundation. The remaining opportunity is helping more customers reach the right styles faster, with less effort, and with greater confidence to continue toward purchase.}\\par
\\vspace{0.05in}
{\\fontsize{7.0}{8.3}\\selectfont
\\setlength{\\tabcolsep}{2.2pt}
\\begin{tabularx}{\\linewidth}{@{}L{0.26\\linewidth}N@{}}
\\toprule
\\textbf{Executive question} & \\textbf{Customer-experience answer}\\\\
\\midrule
Why Dress Up? & Customers already encounter a mature boutique shopping experience, which makes targeted improvements more valuable than a broad redesign.\\\\
What can improve? & Customers can receive clearer early guidance when they begin with an occasion, style, color, fit detail, gift idea, team, or bilingual wording.\\\\
How should value be measured? & Internal shopping behavior, product-page reach, add-to-cart rate, conversion rate, average order value, and margin can quantify the opportunity.\\\\
\\bottomrule
\\end{tabularx}
}
\\vspace{0.07in}
\\begin{itemize}
\\item \\Good{Customers already have a strong shopping foundation.} We observed broad collection paths, seasonal and occasion navigation, sale paths, and public search/suggest evidence.
\\item \\Warn{Customers can receive clearer guidance earlier.} Some shoppers may need to work harder than necessary before reaching the style they intend to buy.
\\item \\Warn{Customers using occasion, fit, color, or bilingual wording should still feel confident.} The buying journey should support how customers naturally describe apparel.
\\item \\Good{Peer analysis supports the recommendations without becoming the headline.} Comparable boutiques help identify options, while the recommendation remains centered on Dress Up's customers.
\\end{itemize}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.31\\linewidth}
\\MetricCard{Shopping Foundation}{Strong}{Customers already have useful product-finding paths to build on.}
\\vspace{0.09in}
\\MetricCard{Customer Effort}{Reduce}{The clearest opportunity is making early style finding easier.}
\\vspace{0.09in}
\\MetricCard{Business Value}{Measure}{Use customer journey data, add-to-cart rate, conversion, order value, and margin to estimate impact.}
\\end{minipage}

\\newpage
\\ReportPageHeader{Executive Opportunity}
\\ReportFooter
\\ReportSection{Recommended Growth Path}
\\ReportCard{Short Version}{Dress Up already gives customers a solid online boutique shopping experience. The next growth opportunity is reducing effort early in product finding: a shopper looking for a wedding guest dress, game day outfit, denim, vacation style, bridal shower dress, or Spanish-language equivalent should reach relevant products quickly, confidently, and with as few extra steps as possible.}
\\vspace{0.10in}
\\CustomerEffortVisual
\\vspace{0.08in}
\\begin{minipage}[t]{0.43\\linewidth}
\\ReportSection{Business Value Lens}
{\\fontsize{7.85}{9.35}\\selectfont
\\setlength{\\tabcolsep}{3.4pt}
\\begin{tabularx}{\\linewidth}{@{}L{0.36\\linewidth}N@{}}
\\toprule
\\textbf{Customer outcome} & Less effort reaching relevant styles.\\\\
\\textbf{Business signal} & Product-page reach, add-to-cart, conversion, order value, and margin.\\\\
\\textbf{Decision use} & Prioritize fixes with Dress Up analytics; no public dollar claim.\\\\
\\bottomrule
\\end{tabularx}
}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.51\\linewidth}
\\ReportSection{90-Day Opportunity Roadmap}
{\\fontsize{7.65}{9.15}\\selectfont
\\setlength{\\tabcolsep}{3.3pt}
\\begin{tabularx}{\\linewidth}{@{}L{0.31\\linewidth}L{0.31\\linewidth}L{0.31\\linewidth}@{}}
\\toprule
\\textbf{0-30 days} & \\textbf{31-60 days} & \\textbf{61-90 days}\\\\
\\midrule
Map customer language across occasion, style, color, fit, team, gift, and bilingual needs. &
Pilot earlier guidance for priority journeys: ${escapeLatex(topGapSummary)}. &
Connect journey analytics to product-page reach, add-to-cart, conversion, order value, and margin.\\\\
\\bottomrule
\\end{tabularx}
}
\\end{minipage}
\\vspace{0.14in}
\\ExecutiveDecisionStrip

\\newpage
\\ReportPageHeader{Reference: Results}
\\ReportFooter
\\ReportSection{Reference A: Concept Results Summary}
{\\fontsize{7.7}{9.0}\\selectfont
\\begin{tabularx}{\\linewidth}{@{}L{0.24\\linewidth}R{0.13\\linewidth}R{0.16\\linewidth}R{0.15\\linewidth}N@{}}
\\toprule
\\textbf{Concept} & \\textbf{Search avg} & \\textbf{Auto avg} & \\textbf{Uniform} & \\textbf{Representative gaps}\\\\
\\midrule
${conceptRows(evidence)}
\\bottomrule
\\end{tabularx}
}
\\vspace{0.14in}
\\ReportSection{Reference B: Highest-Priority Early Guidance Gaps}
{\\fontsize{7.6}{8.9}\\selectfont
\\begin{longtable}{@{}L{0.21\\linewidth}L{0.20\\linewidth}R{0.11\\linewidth}R{0.11\\linewidth}L{0.29\\linewidth}@{}}
\\toprule
\\textbf{Concept} & \\textbf{Query} & \\textbf{Search} & \\textbf{Auto} & \\textbf{Evidence note}\\\\
\\midrule
\\endhead
${topGapRows(evidence)}
\\bottomrule
\\end{longtable}
}

\\newpage
\\ReportPageHeader{Reference: Experiment Data}
\\ReportFooter
\\ReportSection{Reference C: Full Query Dataset}
\\ReportBody{The following table contains all ${evidence.examples.length} public search/autocomplete experiments. Percentages are experiment readouts, not an overall public-facing grade. They are included here so the recommendations can be traced back to concrete shopper-language tests.}\\par
\\vspace{0.06in}
{\\fontsize{6.55}{7.65}\\selectfont
\\setlength{\\tabcolsep}{1.45pt}
\\begin{longtable}{@{}L{0.16\\linewidth}L{0.16\\linewidth}L{0.17\\linewidth}R{0.08\\linewidth}R{0.08\\linewidth}L{0.27\\linewidth}@{}}
\\toprule
\\textbf{Concept} & \\textbf{Query} & \\textbf{Intent} & \\textbf{Search} & \\textbf{Auto} & \\textbf{Evidence note}\\\\
\\midrule
\\endhead
${referenceRows(evidence)}
\\bottomrule
\\end{longtable}
}

\\newpage
\\ReportPageHeader{Reference: Competitors}
\\ReportFooter
\\ReportSection{Reference D: Same-Query Competitor Benchmark}
\\ReportBody{The same ${evidence.examples.length} protected shopper-language examples were run against Dress Up and comparable online boutique retailers where rendered access and public suggest responses were available. Dress Up appears first as the current-site baseline. Peer retailers are reference implementations only; this is not a market-share, ad-spend, or competitor-superiority claim.}\\par
\\vspace{0.06in}
{\\fontsize{7.3}{8.6}\\selectfont
\\setlength{\\tabcolsep}{2.4pt}
\\begin{tabularx}{\\linewidth}{@{}L{0.24\\linewidth}R{0.10\\linewidth}R{0.12\\linewidth}R{0.12\\linewidth}R{0.14\\linewidth}R{0.14\\linewidth}N@{}}
\\toprule
\\textbf{Site} & \\textbf{Queries} & \\textbf{Search usable} & \\textbf{Search avg} & \\textbf{Auto usable} & \\textbf{Auto avg} & \\textbf{Paid labels visible}\\\\
\\midrule
${competitorSiteRows(evidence)}
\\bottomrule
\\end{tabularx}
}
\\vspace{0.12in}
\\ReportSection{Reference E: Competitor Concept Split}
{\\fontsize{7.35}{8.65}\\selectfont
\\setlength{\\tabcolsep}{2.0pt}
\\begin{longtable}{@{}L{0.18\\linewidth}L{0.24\\linewidth}R{0.12\\linewidth}R{0.12\\linewidth}R{0.12\\linewidth}R{0.12\\linewidth}@{}}
\\toprule
\\textbf{Site} & \\textbf{Concept} & \\textbf{Search avg} & \\textbf{Auto avg} & \\textbf{Search rows} & \\textbf{Auto rows}\\\\
\\midrule
\\endhead
${competitorConceptRows(evidence)}
\\bottomrule
\\end{longtable}
}

\\newpage
\\ReportPageHeader{Reference: Competitor Dataset}
\\ReportFooter
\\ReportSection{Reference F: Full Competitor Same-Query Dataset}
\\ReportBody{These rows preserve the same-query competitor rerun. The search score is a bounded public-evidence proxy from rendered access, product-like links, query-term matches, and page text. It is not a calibrated relevance judgment or a paid/organic ranking claim.}\\par
\\vspace{0.06in}
{\\fontsize{5.95}{7.05}\\selectfont
\\setlength{\\tabcolsep}{1.25pt}
\\begin{longtable}{@{}L{0.13\\linewidth}L{0.15\\linewidth}L{0.15\\linewidth}R{0.08\\linewidth}R{0.08\\linewidth}L{0.33\\linewidth}@{}}
\\toprule
\\textbf{Site} & \\textbf{Concept} & \\textbf{Query} & \\textbf{Search} & \\textbf{Auto} & \\textbf{Evidence note}\\\\
\\midrule
\\endhead
${competitorFullRows(evidence)}
\\bottomrule
\\end{longtable}
}

\\newpage
\\ReportPageHeader{Reference: Evidence Limits}
\\ReportFooter
\\ReportSection{Evidence Limits}
\\begin{itemize}
${evidence.evidence_limits.map((limit) => `\\item ${escapeLatex(limit)}`).join('\n')}
\\end{itemize}
\\vspace{0.10in}
\\ReportCard{Recommended Follow-Up}{The next conversation should connect these public findings to actual search usage, product-page reach, add-to-cart rate, conversion rate, average order value, margin, and inventory priorities. That would turn the directional opportunity into a measurable customer-experience roadmap.}

\\end{document}
`;
}

function writeReports(evidence) {
  writeJson(evidencePath, evidence);
  writeJson(reportJsonPath, buildReportJson(evidence));
  writeText(reportMdPath, buildMarkdown(evidence));
  writeText(reportTexPath, buildLatex(evidence));
}

async function main() {
  let evidence;
  if (process.env.DRESSUP_REBUILD_FROM_EVIDENCE === '1') {
    evidence = readJson(evidencePath);
  } else {
    const collected = await collectEvidence();
    evidence = buildEvidence(collected);
  }
  writeReports(evidence);
  console.log(JSON.stringify({
    evidencePath: path.relative(ROOT, evidencePath),
    reportJsonPath: path.relative(ROOT, reportJsonPath),
    reportMdPath: path.relative(ROOT, reportMdPath),
    reportTexPath: path.relative(ROOT, reportTexPath),
    examples: evidence.summary.total_examples,
    searchAverage: evidence.summary.search_average,
    autocompleteAverage: evidence.summary.autocomplete_average,
    uniformRate: evidence.summary.uniform_experience_rate,
    competitors: (evidence.competitor_query_benchmark?.sites || []).map((site) => site.name)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
