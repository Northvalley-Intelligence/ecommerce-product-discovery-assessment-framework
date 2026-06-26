import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || '';
const chromeChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome';
const generationId = 'GEN-003';
const outputDir = path.join('assessments', 'boxercraft', 'browser-evidence', generationId);
const screenshotDir = path.join(outputDir, 'screenshots');
const resultPath = path.join(outputDir, 'browser-validation.json');

const desktopViewport = { width: 1366, height: 900 };
const mobileViewport = { width: 390, height: 844 };

const failures = [];

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
  const candidates = [title, text];
  for (const candidate of candidates) {
    const match = normalizeText(candidate).match(/(\d+)\s+(?:results? found|results?|item\(s\)|items?)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function unique(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

async function bodyText(page) {
  return normalizeText(await page.locator('body').innerText().catch(() => ''));
}

async function visibleTexts(page, selector, limit = 12) {
  return unique(await page.locator(selector).evaluateAll((nodes, max) => nodes
    .filter((node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length))
    .map((node) => node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.value || '')
    .filter(Boolean)
    .slice(0, max), limit).catch(() => []));
}

async function screenshot(page, name, fullPage = false) {
  const filePath = path.join(screenshotDir, `${name}.png`);
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

async function newPage(browser, viewport, mobile = false) {
  const page = await browser.newPage({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1
  });
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
  let clicked = false;
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    throw new Error('No visible retail search trigger found.');
  }
  await page.waitForTimeout(600);
  return page.locator('#boost-pfs-search-box-0, input[type="search"][name="q"]').first();
}

async function evaluateAutocomplete(browser, viewportName, viewport, query, mobile = false) {
  const page = await newPage(browser, viewport, mobile);
  await goto(page, 'https://boxercraft.com/', 2500);
  const searchInput = await openRetailSearch(page);
  await searchInput.click();
  await searchInput.fill('');
  await searchInput.type(query, { delay: 35 });
  await page.waitForTimeout(2600);

  const predictiveText = normalizeText(await page.locator('#PredictiveWrapper').innerText().catch(() => ''));
  const boostText = normalizeText(await page.locator('#boost-pfs-search-suggestion-0').innerText().catch(() => ''));
  const combinedText = normalizeText(`${boostText} ${predictiveText}`);
  const productTitles = await visibleTexts(page, '#PredictiveResults .grid-product__title, #boost-pfs-search-suggestion-0 .boost-pfs-search-suggestion-product-title, #boost-pfs-search-suggestion-0 a', 10);
  const nothingFound = /sorry,\s*nothing found/i.test(combinedText) || (combinedText.replace(/view more/ig, '').trim().length === 0);
  const shot = await screenshot(page, `${viewportName}-autocomplete-${slug(query)}`);
  await page.close();

  return {
    query,
    viewport: viewportName,
    screenshot: shot,
    nothing_found: nothingFound,
    visible_text: combinedText.slice(0, 900),
    product_titles: productTitles
  };
}

async function evaluateRetailSearchPage(browser, query) {
  const page = await newPage(browser, desktopViewport);
  const url = `https://boxercraft.com/search?q=${encodeURIComponent(query)}`;
  await goto(page, url, 4200);
  const text = await bodyText(page);
  const title = await page.title();
  const productTitles = await visibleTexts(page, '.grid-product__title, .grid-product__title--body', 18);
  const filterLabels = await visibleTexts(page, '#CollectionSidebar button, .collection-sidebar button, .collection-filter label, .collection-filter select', 12);
  const shot = await screenshot(page, `desktop-search-${slug(query)}`);
  await page.close();

  return {
    query,
    url,
    title,
    screenshot: shot,
    result_count: parseResultCount(text, title),
    zero_result_message: /did not yield any results|0 results/i.test(text),
    recovery_text: text.match(/did not yield any results[^.]*\./i)?.[0] || '',
    filter_labels: filterLabels,
    product_titles: productTitles
  };
}

async function evaluateFleeceCollection(browser, viewportName, viewport, mobile = false) {
  const page = await newPage(browser, viewport, mobile);
  const url = 'https://boxercraft.com/collections/fleece';
  await goto(page, url, 4200);
  const text = await bodyText(page);
  const productTitles = await visibleTexts(page, '.grid-product__title, .grid-product__title--body', 18);
  const sortLabels = await visibleTexts(page, '.collection-filter select, .boost-pfs-filter-top-sorting-select', 8);
  let drawerText = '';
  const filterButton = page.locator('button.js-drawer-open-collection-filters, button:has-text("Filter")').first();
  const hasFilterButton = await filterButton.isVisible().catch(() => false);
  if (hasFilterButton) {
    await filterButton.click().catch(() => {});
    await page.waitForTimeout(1200);
    drawerText = await bodyText(page);
  }
  const shot = await screenshot(page, `${viewportName}-fleece-filters`);
  await page.close();

  return {
    viewport: viewportName,
    url,
    screenshot: shot,
    result_count: parseResultCount(text),
    has_filter_button: hasFilterButton,
    sort_labels: sortLabels,
    drawer_text: drawerText.slice(0, 1200),
    product_titles: productTitles
  };
}

async function evaluateProductRecommendations(browser) {
  const page = await newPage(browser, desktopViewport);
  const url = 'https://boxercraft.com/products/q10-sherpa-quarter-zip-pullover-1';
  await goto(page, url, 6000);
  const text = await bodyText(page);
  const title = normalizeText(await page.locator('h1').first().innerText().catch(() => ''));
  const recommendationTitles = await visibleTexts(page, '#shopify-section-template--22250075521314__product-recommendations .grid-product__title, [id*="Recommendations"] .grid-product__title', 12);
  const shot = await screenshot(page, 'desktop-product-recommendations');
  await page.close();

  return {
    url,
    screenshot: shot,
    product_title: title,
    section_present: /you may also like/i.test(text),
    recommendation_titles: recommendationTitles,
    unique_recommendation_count: unique(recommendationTitles).length,
    self_recommendation_only: recommendationTitles.length > 0 && unique(recommendationTitles).every((item) => item.toLowerCase() === title.toLowerCase())
  };
}

async function evaluateMobileHome(browser) {
  const page = await newPage(browser, mobileViewport, true);
  await goto(page, 'https://boxercraft.com/', 2500);
  const text = await bodyText(page);
  const controls = await visibleTexts(page, 'button, a[href="/search"], a.js-search-header', 12);
  const shot = await screenshot(page, 'mobile-home-first-viewport');
  await page.close();
  return {
    viewport: 'mobile',
    screenshot: shot,
    first_viewport_text: text.slice(0, 900),
    controls,
    exposes_search: controls.some((control) => /search/i.test(control)),
    exposes_site_navigation: controls.some((control) => /site navigation/i.test(control))
  };
}

async function evaluateWholesale(browser) {
  const page = await newPage(browser, desktopViewport);
  const homeUrl = 'https://wholesale.boxercraft.com/';
  await goto(page, homeUrl, 5000);
  const homeText = await bodyText(page);
  const homeControls = await visibleTexts(page, 'input, a, button', 20);
  const homeScreenshot = await screenshot(page, 'desktop-wholesale-home');

  const searches = [];
  for (const query of ['fleece', 'BM5205']) {
    const url = `https://wholesale.boxercraft.com/search.html?query=${encodeURIComponent(query)}&page=1`;
    await goto(page, url, 5000);
    const text = await bodyText(page);
    searches.push({
      query,
      url,
      screenshot: await screenshot(page, `desktop-wholesale-search-${slug(query)}`),
      result_count: parseResultCount(text),
      product_titles: await visibleTexts(page, 'a, .product-item-link, [class*="product"]', 24),
      filter_text: text.match(/Filters.*?Products Per Page/i)?.[0] || ''
    });
  }

  const categoryUrl = 'https://wholesale.boxercraft.com/shop/fleece-sweatshirts?page=1&brand%5Bfilter%5D=BOXERCRAFT%2C1366';
  await goto(page, categoryUrl, 5000);
  const categoryText = await bodyText(page);
  const category = {
    url: categoryUrl,
    screenshot: await screenshot(page, 'desktop-wholesale-fleece-category'),
    result_count: parseResultCount(categoryText),
    first_text: categoryText.slice(0, 1200)
  };
  await page.close();

  return {
    home_url: homeUrl,
    home_screenshot: homeScreenshot,
    home_has_search: /search/i.test(homeText) || homeControls.some((control) => /search/i.test(control)),
    home_has_sign_in: /sign in/i.test(homeText),
    home_has_account_signup: /new customer signup|apply for an account/i.test(homeText),
    home_controls: homeControls,
    searches,
    category
  };
}

function addFinding(result, severity, category, summary, evidence) {
  result.findings.push({
    severity,
    category,
    summary,
    evidence
  });
}

const startedAt = new Date().toISOString();
const launchOptions = chromePath
  ? { headless: true, executablePath: chromePath }
  : { headless: true, channel: chromeChannel };

const browser = await chromium.launch(launchOptions);

const result = {
  validation_run_id: 'BOXERCRAFT-BROWSER-GEN-003',
  generation_id: generationId,
  started_at: startedAt,
  completed_at: null,
  browser: {
    engine: 'chromium',
    executable_path: chromePath || null,
    channel: chromePath ? null : chromeChannel,
    desktop_viewport: desktopViewport,
    mobile_viewport: mobileViewport
  },
  validations: {},
  findings: [],
  failures
};

try {
  result.validations.autocomplete = [
    await evaluateAutocomplete(browser, 'desktop', desktopViewport, 'maroon quarter zip'),
    await evaluateAutocomplete(browser, 'desktop', desktopViewport, 'quarterzip'),
    await evaluateAutocomplete(browser, 'desktop', desktopViewport, 'quarter zip'),
    await evaluateAutocomplete(browser, 'desktop', desktopViewport, 'womens fleece'),
    await evaluateAutocomplete(browser, 'desktop', desktopViewport, 'Georgia Bulldogs'),
    await evaluateAutocomplete(browser, 'mobile', mobileViewport, 'maroon quarter zip', true)
  ];

  result.validations.search_pages = [
    await evaluateRetailSearchPage(browser, 'maroon quarter zip'),
    await evaluateRetailSearchPage(browser, 'quarterzip'),
    await evaluateRetailSearchPage(browser, 'Georgia Bulldogs'),
    await evaluateRetailSearchPage(browser, 'zzzznotaproduct')
  ];

  result.validations.fleece_collection = [
    await evaluateFleeceCollection(browser, 'desktop', desktopViewport),
    await evaluateFleeceCollection(browser, 'mobile', mobileViewport, true)
  ];

  result.validations.product_recommendations = await evaluateProductRecommendations(browser);
  result.validations.mobile_home = await evaluateMobileHome(browser);
  result.validations.wholesale_public = await evaluateWholesale(browser);
} finally {
  await browser.close().catch(() => {});
}

const autocomplete = result.validations.autocomplete;
const searchPages = result.validations.search_pages;
const maroonAuto = autocomplete.find((item) => item.query === 'maroon quarter zip' && item.viewport === 'desktop');
const quarterzipAuto = autocomplete.find((item) => item.query === 'quarterzip');
const teamAuto = autocomplete.find((item) => item.query === 'Georgia Bulldogs');
const maroonSearch = searchPages.find((item) => item.query === 'maroon quarter zip');
const teamSearch = searchPages.find((item) => item.query === 'Georgia Bulldogs');
const productRecommendations = result.validations.product_recommendations;
const mobileHome = result.validations.mobile_home;
const wholesale = result.validations.wholesale_public;

if (!maroonSearch?.result_count || maroonSearch.result_count < 1) {
  failures.push('Expected maroon quarter zip retail search to return products.');
}
if (!teamSearch?.zero_result_message) {
  failures.push('Expected Georgia Bulldogs retail search to produce a zero-result state for this validation target.');
}
if (!mobileHome?.exposes_search) {
  failures.push('Expected mobile first viewport/header controls to expose search.');
}
if (!wholesale?.home_has_search || !wholesale.searches?.[0]?.result_count) {
  failures.push('Expected public wholesale home/search to expose searchable product discovery.');
}

if (maroonAuto?.nothing_found && maroonSearch?.result_count > 0) {
  addFinding(
    result,
    'High',
    'Autocomplete',
    'Rendered autocomplete still returns no useful suggestions for "maroon quarter zip" even though full retail search returns products.',
    [maroonAuto.screenshot, maroonSearch.screenshot]
  );
}
if (quarterzipAuto && !quarterzipAuto.nothing_found) {
  addFinding(
    result,
    'Resolved / Positive',
    'Autocomplete',
    'Rendered Boost autocomplete returns product suggestions for "quarterzip"; the earlier endpoint-only gap should be narrowed to other dropped intents.',
    [quarterzipAuto.screenshot]
  );
}
if (teamAuto?.nothing_found && teamSearch?.zero_result_message) {
  addFinding(
    result,
    'High',
    'Search Recovery',
    'Team-name intent remains a dead end in both autocomplete and submitted search.',
    [teamAuto.screenshot, teamSearch.screenshot]
  );
}
if (productRecommendations?.self_recommendation_only) {
  addFinding(
    result,
    'Medium',
    'Recommendations',
    'The product recommendation module is present but recommended the same product, limiting related-discovery value.',
    [productRecommendations.screenshot]
  );
}
if (wholesale?.searches?.some((item) => item.query === 'BM5205' && item.result_count === 1)) {
  addFinding(
    result,
    'Positive',
    'Public Wholesale Discovery',
    'Public wholesale search supports SKU/product-code lookup for BM5205, while account and order workflows still require sign-in.',
    wholesale.searches.map((item) => item.screenshot)
  );
}

result.completed_at = new Date().toISOString();
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`Browser validation written to ${resultPath}`);
console.log(`Screenshots written to ${screenshotDir}`);
console.log(`Findings: ${result.findings.length}`);
if (failures.length > 0) {
  console.error('Browser validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Browser validation passed');
