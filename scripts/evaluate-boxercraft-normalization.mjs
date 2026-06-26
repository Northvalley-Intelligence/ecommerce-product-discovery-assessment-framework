import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || '';
const chromeChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome';
const generationId = 'GEN-004';
const outputDir = path.join('assessments', 'boxercraft', 'normalization-evidence', generationId);
const screenshotDir = path.join(outputDir, 'screenshots');
const resultPath = path.join(outputDir, 'normalization-evaluation.json');
const desktopViewport = { width: 1366, height: 900 };

const failures = [];

const matrix = [
  {
    id: 'quarter_zip_spacing_abbreviation',
    label: 'Quarter-zip spacing, punctuation, and abbreviation',
    expected_terms: ['quarter', 'zip', 'qtr', '1/4'],
    expected_browse_terms: ['quarter', 'zip', 'pullovers'],
    queries: ['quarter zip', 'quarter-zip', 'quarterzip', 'qtr zip', 'qtr-zip', '1/4 zip']
  },
  {
    id: 'womens_fleece_possessive',
    label: "Women's fleece plurality and alternate terms",
    expected_terms: ['women', 'womens', "women's", 'ladies', 'fleece'],
    expected_browse_terms: ['women', 'outerwear', 'fleece'],
    queries: ['womens fleece', "women's fleece", 'women fleece', 'ladies fleece', 'female fleece']
  },
  {
    id: 'ucla_bruins_priority',
    label: 'UCLA / Bruins priority-account terms',
    stakeholder_context: 'User reported that UCLA may be Boxercraft priority-account demand. Treat as unverified stakeholder context, not a public factual claim.',
    expected_terms: ['ucla', 'bruins', 'university of california', 'los angeles'],
    expected_browse_terms: ['ucla', 'bruins', 'fan shop'],
    queries: ['UCLA', 'UCLA Bruins', 'Bruins apparel', 'University of California Los Angeles', 'UC Los Angeles', 'UCLA fleece', 'UCLA sweatshirt', 'UCLA quarter zip']
  },
  {
    id: 'team_fan_shop_aliases',
    label: 'Team and fan-shop alias recovery',
    expected_terms: ['team', 'fan', 'college', 'bulldogs', 'bruins', 'ucla'],
    expected_browse_terms: ['team', 'fan shop', 'college', 'ucla', 'bruins'],
    queries: ['college teams', 'fan shop', 'team apparel', 'Bulldogs', 'Georgia Bulldogs', 'Bruins']
  },
  {
    id: 'color_product_terms',
    label: 'Color-plus-product normalization',
    expected_terms: ['quarter', 'zip', 'maroon', 'red', 'burgundy', 'cardinal'],
    expected_browse_terms: ['quarter', 'zip', 'pullovers'],
    queries: ['maroon quarter zip', 'burgundy quarter zip', 'cardinal quarter zip', 'red quarter zip', 'maroon qtr zip']
  },
  {
    id: 'public_wholesale_sku_variants',
    label: 'Public wholesale SKU and product-code variants',
    context: 'Public wholesale search only; authenticated account, pricing, order, and inventory workflows remain out of scope.',
    expected_terms: ['bm5205', 'alumni', 'qtr', 'quarter', 'zip'],
    surface: 'public_wholesale',
    queries: ['BM5205', 'bm5205', 'BM 5205', 'BM-5205', 'alumni qtr zip', 'alumni quarter zip']
  }
];

fs.mkdirSync(screenshotDir, { recursive: true });

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function relative(pathname) {
  return pathname.split(path.sep).join('/');
}

function parseResultCount(text, title = '') {
  for (const candidate of [title, text]) {
    const match = normalizeText(candidate).match(/(\d+)\s+(?:results? found|results?|item\(s\)|items?)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function includesAny(text, terms) {
  const lower = normalizeText(text).toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function unique(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function browsePathFromLinks(links, expectedBrowseTerms = []) {
  const browseLinks = links.filter((link) => /\/collections\/|\/pages\//.test(link.href || ''));
  const relevant = browseLinks.filter((link) => includesAny(`${link.text} ${link.href}`, expectedBrowseTerms));
  return {
    has_browse_path: relevant.length > 0,
    relevant_count: relevant.length,
    relevant_links: relevant.slice(0, 8),
    all_browse_links_sample: browseLinks.slice(0, 8)
  };
}

async function visibleTexts(page, selector, limit = 12) {
  return unique(await page.locator(selector).evaluateAll((nodes, max) => nodes
    .filter((node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length))
    .map((node) => node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.value || '')
    .filter(Boolean)
    .slice(0, max), limit).catch(() => []));
}

async function visibleLinks(page, selector = 'a', limit = 80) {
  return unique(await page.locator(selector).evaluateAll((nodes, max) => nodes
    .filter((node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length))
    .map((node) => ({
      text: (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
      href: node.href || node.getAttribute('href') || ''
    }))
    .filter((item) => item.text || item.href)
    .slice(0, max)
    .map((item) => JSON.stringify(item)), limit).catch(() => []))
    .map((item) => JSON.parse(item));
}

async function bodyText(page) {
  return normalizeText(await page.locator('body').innerText().catch(() => ''));
}

async function screenshot(page, prefix, query, fullPage = false) {
  const filePath = path.join(screenshotDir, `${prefix}-${slug(query)}.png`);
  await page.screenshot({ path: filePath, fullPage });
  const stats = fs.statSync(filePath);
  if (stats.size < 1000) failures.push(`Screenshot appears empty or too small: ${filePath}`);
  return relative(filePath);
}

async function dismissPopups(page) {
  const selectors = [
    'button[aria-label*="close" i]',
    'button:has-text("No thanks")',
    'button:has-text("Close")',
    '.needsclick button:has-text("x")',
    '.needsclick button:has-text("×")'
  ];
  for (const selector of selectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 3); index += 1) {
      const button = buttons.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 1000 }).catch(() => {});
      }
    }
  }
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: desktopViewport });
  page.setDefaultTimeout(10000);
  return page;
}

async function goto(page, url, settleMs = 3200) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(settleMs);
  await dismissPopups(page);
}

async function openRetailSearch(page) {
  const triggers = page.locator('a.js-search-header').filter({ hasText: /search/i });
  const count = await triggers.count();
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await page.waitForTimeout(600);
      return page.locator('#boost-pfs-search-box-0, input[type="search"][name="q"]').first();
    }
  }
  throw new Error('No visible retail search trigger found.');
}

async function evaluateAutocomplete(browser, query, expectedTerms, expectedBrowseTerms = []) {
  const page = await newPage(browser);
  await goto(page, 'https://boxercraft.com/', 2200);
  const searchInput = await openRetailSearch(page);
  await searchInput.click();
  await searchInput.fill('');
  await searchInput.type(query, { delay: 30 });
  await page.waitForTimeout(2300);

  const predictiveText = normalizeText(await page.locator('#PredictiveWrapper').innerText().catch(() => ''));
  const boostText = normalizeText(await page.locator('#boost-pfs-search-suggestion-0').innerText().catch(() => ''));
  const combinedText = normalizeText(`${boostText} ${predictiveText}`);
  const productTitles = await visibleTexts(page, '#PredictiveResults .grid-product__title, #boost-pfs-search-suggestion-0 .boost-pfs-search-suggestion-product-title, #boost-pfs-search-suggestion-0 a', 12);
  const links = await visibleLinks(page, '#PredictiveWrapper a, #boost-pfs-search-suggestion-0 a', 80);
  const nothingFound = /sorry,\s*nothing found/i.test(combinedText) || (combinedText.replace(/view more/ig, '').trim().length === 0);
  const shot = await screenshot(page, 'autocomplete', query);
  await page.close();

  return {
    query,
    screenshot: shot,
    nothing_found: nothingFound,
    has_relevant_text: !nothingFound && includesAny(`${combinedText} ${productTitles.join(' ')}`, expectedTerms),
    browse_path: browsePathFromLinks(links, expectedBrowseTerms),
    visible_text: combinedText.slice(0, 900),
    product_titles: productTitles
  };
}

async function evaluateRetailSearch(browser, query, expectedTerms, expectedBrowseTerms = []) {
  const page = await newPage(browser);
  const url = `https://boxercraft.com/search?q=${encodeURIComponent(query)}`;
  await goto(page, url, 3600);
  const text = await bodyText(page);
  const title = await page.title();
  const productTitles = await visibleTexts(page, '.grid-product__title, .grid-product__title--body', 18);
  const links = await visibleLinks(page, 'a', 120);
  const shot = await screenshot(page, 'search', query);
  await page.close();

  const resultCount = parseResultCount(text, title);
  return {
    query,
    url,
    title,
    screenshot: shot,
    result_count: resultCount,
    has_results: Number.isFinite(resultCount) && resultCount > 0,
    has_relevant_text: Number.isFinite(resultCount) && resultCount > 0 && includesAny(`${title} ${productTitles.join(' ')} ${text.slice(0, 1200)}`, expectedTerms),
    browse_path: browsePathFromLinks(links, expectedBrowseTerms),
    product_titles: productTitles
  };
}

async function evaluateWholesaleSearch(browser, query, expectedTerms) {
  const page = await newPage(browser);
  const url = `https://wholesale.boxercraft.com/search.html?query=${encodeURIComponent(query)}&page=1`;
  await goto(page, url, 4200);
  const text = await bodyText(page);
  const title = await page.title();
  const productTitles = await visibleTexts(page, 'a, .product-item-link, [class*="product"]', 24);
  const shot = await screenshot(page, 'wholesale-search', query);
  await page.close();

  const resultCount = parseResultCount(text, title);
  return {
    query,
    url,
    title,
    screenshot: shot,
    result_count: resultCount,
    has_results: Number.isFinite(resultCount) && resultCount > 0,
    has_relevant_text: Number.isFinite(resultCount) && resultCount > 0 && includesAny(`${title} ${productTitles.join(' ')} ${text.slice(0, 1200)}`, expectedTerms),
    product_titles: productTitles
  };
}

function summarizeGroup(group, evaluations) {
  const searchEvaluations = evaluations.map((item) => item.search).filter(Boolean);
  const autocompleteEvaluations = evaluations.map((item) => item.autocomplete).filter(Boolean);
  const searchPositive = searchEvaluations.filter((item) => item.has_results && item.has_relevant_text);
  const autocompletePositive = autocompleteEvaluations.filter((item) => !item.nothing_found && item.has_relevant_text);
  const searchBrowsePositive = searchEvaluations.filter((item) => item.browse_path?.has_browse_path);
  const autocompleteBrowsePositive = autocompleteEvaluations.filter((item) => item.browse_path?.has_browse_path);
  const parityGaps = evaluations
    .filter((item) => item.search?.has_results && item.search?.has_relevant_text && item.autocomplete?.nothing_found)
    .map((item) => item.query);
  const resultCounts = searchEvaluations
    .map((item) => item.result_count)
    .filter((count) => Number.isFinite(count));
  const nonZeroCounts = resultCounts.filter((count) => count > 0);
  const zeroSearchQueries = searchEvaluations
    .filter((item) => !item.has_results)
    .map((item) => item.query);
  const browsePathGapQueries = evaluations
    .filter((item) => item.search && !item.search.browse_path?.has_browse_path && (!item.autocomplete || !item.autocomplete.browse_path?.has_browse_path))
    .map((item) => item.query);

  return {
    group_id: group.id,
    label: group.label,
    query_count: group.queries.length,
    search_relevant_count: searchPositive.length,
    autocomplete_relevant_count: autocompletePositive.length,
    search_browse_path_count: searchBrowsePositive.length,
    autocomplete_browse_path_count: autocompleteBrowsePositive.length,
    search_relevant_rate: Number((searchPositive.length / Math.max(searchEvaluations.length, 1)).toFixed(2)),
    autocomplete_relevant_rate: autocompleteEvaluations.length ? Number((autocompletePositive.length / autocompleteEvaluations.length).toFixed(2)) : null,
    search_browse_path_rate: Number((searchBrowsePositive.length / Math.max(searchEvaluations.length, 1)).toFixed(2)),
    autocomplete_browse_path_rate: autocompleteEvaluations.length ? Number((autocompleteBrowsePositive.length / autocompleteEvaluations.length).toFixed(2)) : null,
    parity_gap_queries: parityGaps,
    zero_search_queries: zeroSearchQueries,
    browse_path_gap_queries: browsePathGapQueries,
    min_nonzero_result_count: nonZeroCounts.length ? Math.min(...nonZeroCounts) : 0,
    max_result_count: resultCounts.length ? Math.max(...resultCounts) : null,
    result_count_spread: nonZeroCounts.length ? Math.max(...nonZeroCounts) - Math.min(...nonZeroCounts) : null,
    interpretation: ''
  };
}

function addFinding(result, severity, category, summary, evidence, queries = []) {
  result.findings.push({ severity, category, summary, evidence, queries });
}

const startedAt = new Date().toISOString();
const launchOptions = chromePath
  ? { headless: true, executablePath: chromePath }
  : { headless: true, channel: chromeChannel };

const browser = await chromium.launch(launchOptions);

const result = {
  evaluation_id: 'BOXERCRAFT-NORMALIZATION-GEN-004',
  generation_id: generationId,
  started_at: startedAt,
  completed_at: null,
  browser: {
    engine: 'chromium',
    executable_path: chromePath || null,
    channel: chromePath ? null : chromeChannel,
    desktop_viewport: desktopViewport
  },
  matrix,
  groups: [],
  summaries: [],
  findings: [],
  failures
};

try {
  for (const group of matrix) {
    const evaluations = [];
    for (const query of group.queries) {
      if (group.surface === 'public_wholesale') {
        evaluations.push({
          query,
          search: await evaluateWholesaleSearch(browser, query, group.expected_terms),
          autocomplete: null
        });
        continue;
      }
      evaluations.push({
        query,
        search: await evaluateRetailSearch(browser, query, group.expected_terms, group.expected_browse_terms),
        autocomplete: await evaluateAutocomplete(browser, query, group.expected_terms, group.expected_browse_terms)
      });
    }

    const summary = summarizeGroup(group, evaluations);
    if (group.id === 'ucla_bruins_priority') {
      summary.interpretation = 'UCLA acronym and Bruins variants deserve explicit monitoring because the user identified this as priority-account demand; the client-size claim remains stakeholder context, not independently verified public evidence.';
    } else if (summary.parity_gap_queries.length > 0) {
      summary.interpretation = 'Search can recover some variants that autocomplete drops, creating pre-search abandonment risk.';
    } else if (summary.search_relevant_rate === 1 && (summary.autocomplete_relevant_rate === 1 || summary.autocomplete_relevant_rate === null)) {
      summary.interpretation = 'Tested variants are consistently recoverable on this surface.';
    } else {
      summary.interpretation = 'Normalization is uneven across tested variants.';
    }

    result.groups.push({
      group_id: group.id,
      label: group.label,
      stakeholder_context: group.stakeholder_context || null,
      surface: group.surface || 'public_consumer',
      expected_terms: group.expected_terms,
      expected_browse_terms: group.expected_browse_terms || [],
      evaluations
    });
    result.summaries.push(summary);
  }
} finally {
  await browser.close().catch(() => {});
}

const uclaSummary = result.summaries.find((item) => item.group_id === 'ucla_bruins_priority');
const colorSummary = result.summaries.find((item) => item.group_id === 'color_product_terms');
const teamSummary = result.summaries.find((item) => item.group_id === 'team_fan_shop_aliases');
const quarterSummary = result.summaries.find((item) => item.group_id === 'quarter_zip_spacing_abbreviation');
const wholesaleSummary = result.summaries.find((item) => item.group_id === 'public_wholesale_sku_variants');

if (uclaSummary?.search_relevant_count < 4) {
  failures.push('Expected at least four UCLA/Bruins priority queries to return relevant search results.');
}
if (uclaSummary?.parity_gap_queries.length > 0 || (uclaSummary?.autocomplete_relevant_rate ?? 0) < 0.5) {
  addFinding(
    result,
    'High',
    'Priority Account Normalization',
    'UCLA/Bruins demand is partially recoverable in search, but autocomplete coverage is weaker than search for priority-account variants.',
    result.groups.find((item) => item.group_id === 'ucla_bruins_priority')?.evaluations.flatMap((item) => [
      item.search?.screenshot,
      item.autocomplete?.screenshot
    ].filter(Boolean)).slice(0, 8) || [],
    uclaSummary.parity_gap_queries
  );
}
if (colorSummary?.parity_gap_queries.length > 0) {
  addFinding(
    result,
    'High',
    'Autocomplete Normalization',
    'Color-plus-product queries produce search results but are dropped by autocomplete for multiple tested variants.',
    result.groups.find((item) => item.group_id === 'color_product_terms')?.evaluations.flatMap((item) => [
      item.search?.screenshot,
      item.autocomplete?.screenshot
    ].filter(Boolean)).slice(0, 8) || [],
    colorSummary.parity_gap_queries
  );
}
if (teamSummary?.zero_search_queries.length > 0) {
  addFinding(
    result,
    'High',
    'Team Intent Recovery',
    'Team and fan-shop aliases remain uneven: some broad terms recover, while direct unsupported team names still dead-end.',
    result.groups.find((item) => item.group_id === 'team_fan_shop_aliases')?.evaluations.flatMap((item) => [
      item.search?.screenshot,
      item.autocomplete?.screenshot
    ].filter(Boolean)).slice(0, 8) || [],
    teamSummary.zero_search_queries
  );
}
if ([uclaSummary, teamSummary, quarterSummary, colorSummary].some((summary) => summary?.browse_path_gap_queries.length > 0)) {
  const browseGapQueries = [uclaSummary, teamSummary, quarterSummary, colorSummary]
    .flatMap((summary) => summary?.browse_path_gap_queries || []);
  addFinding(
    result,
    'High',
    'Search And Autocomplete To Browse',
    'Search and autocomplete do not consistently route normalized terms to useful collection, page, or fan-shop browse destinations.',
    result.groups
      .filter((item) => ['ucla_bruins_priority', 'team_fan_shop_aliases', 'quarter_zip_spacing_abbreviation', 'color_product_terms'].includes(item.group_id))
      .flatMap((item) => item.evaluations)
      .filter((item) => browseGapQueries.includes(item.query))
      .flatMap((item) => [
        item.search?.screenshot,
        item.autocomplete?.screenshot
      ].filter(Boolean))
      .slice(0, 10),
    browseGapQueries
  );
}
if (quarterSummary?.search_relevant_rate === 1 && (quarterSummary?.autocomplete_relevant_rate ?? 0) >= 0.8) {
  addFinding(
    result,
    'Positive',
    'Quarter-Zip Normalization',
    'Quarter-zip spacing and punctuation variants are mostly recoverable across search and autocomplete.',
    result.groups.find((item) => item.group_id === 'quarter_zip_spacing_abbreviation')?.evaluations.flatMap((item) => [
      item.search?.screenshot,
      item.autocomplete?.screenshot
    ].filter(Boolean)).slice(0, 8) || [],
    []
  );
}
if (wholesaleSummary?.zero_search_queries.length > 0) {
  addFinding(
    result,
    'Medium',
    'Public Wholesale SKU Normalization',
    'Public wholesale search handles exact SKU lookup better than spaced or hyphenated SKU variants.',
    result.groups.find((item) => item.group_id === 'public_wholesale_sku_variants')?.evaluations.map((item) => item.search?.screenshot).filter(Boolean).slice(0, 8) || [],
    wholesaleSummary.zero_search_queries
  );
}

result.completed_at = new Date().toISOString();
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`Normalization evaluation written to ${resultPath}`);
console.log(`Screenshots written to ${screenshotDir}`);
console.log(`Groups: ${result.groups.length}`);
console.log(`Queries: ${matrix.reduce((sum, group) => sum + group.queries.length, 0)}`);
console.log(`Findings: ${result.findings.length}`);
if (failures.length > 0) {
  console.error('Normalization evaluation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Normalization evaluation passed');
