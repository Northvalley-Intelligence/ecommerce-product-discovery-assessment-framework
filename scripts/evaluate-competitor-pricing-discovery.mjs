import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const generationId = 'GEN-006';
const outputDir = path.join('assessments', 'boxercraft', 'competitor-evidence', generationId);
const screenshotDir = path.join(outputDir, 'screenshots');
const resultPath = path.join(outputDir, 'competitor-pricing-discovery.json');
const summaryPath = path.join(outputDir, 'competitor-pricing-discovery.md');
const desktopViewport = { width: 1366, height: 900 };
const defaultChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH || (fs.existsSync(defaultChromePath) ? defaultChromePath : '');
const chromeChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome';

const failures = [];
const warnings = [];

const sites = [
  {
    id: 'boxercraft',
    name: 'Boxercraft',
    role: 'baseline target',
    base_url: 'https://boxercraft.com',
    platform: 'shopify',
    browse_url: 'https://boxercraft.com/collections/all',
    pricing_source: 'Shopify products JSON'
  },
  {
    id: 'l2brands',
    name: 'L2 Brands',
    role: 'licensed college apparel competitor',
    base_url: 'https://l2brands.com',
    platform: 'shopify',
    browse_url: 'https://l2brands.com/collections/all',
    pricing_source: 'Shopify products JSON'
  },
  {
    id: 'colosseum',
    name: 'Colosseum Athletics',
    role: 'licensed college apparel competitor',
    base_url: 'https://colosseumathletics.com',
    platform: 'shopify',
    browse_url: 'https://colosseumathletics.com/collections/all',
    pricing_source: 'Shopify products JSON'
  },
  {
    id: 'concepts_sport',
    name: 'Concepts Sport',
    role: 'licensed lounge and sleepwear competitor',
    base_url: 'https://www.conceptssport.com',
    platform: 'wix_catalog',
    browse_url: 'https://www.conceptssport.com/products',
    pricing_source: 'Rendered public catalog; public prices were not observed during automation'
  },
  {
    id: 'fanatics',
    name: 'Fanatics',
    role: 'licensed sports marketplace benchmark',
    base_url: 'https://www.fanatics.com',
    platform: 'marketplace_access_limited',
    browse_url: 'https://www.fanatics.com',
    pricing_source: 'Marketplace benchmark; no comparable brand-owned public catalog feed evaluated in this run'
  }
];

const categories = [
  {
    id: 'flannel_pants',
    label: 'Flannel pants',
    predicate: (text) => has(text, 'flannel') && /\bpants?\b/.test(text)
  },
  {
    id: 'lounge_pants_joggers',
    label: 'Lounge pants, joggers, and sweatpants',
    predicate: (text, nameText) => /\b(pants?|joggers?|sweatpants?|pajama)\b/.test(text) && !/\b(shorts?|hat|cap|beanie)\b/.test(nameText)
  },
  {
    id: 'quarter_zips',
    label: 'Quarter zips and 1/4 zips',
    predicate: (text) => (hasAny(text, ['quarter', '1/4', 'qtr']) && has(text, 'zip'))
  },
  {
    id: 'fleece_tops',
    label: 'Fleece tops, hoodies, crews, and jackets',
    predicate: (text, nameText) => has(text, 'fleece') && hasAny(text, ['hoodie', 'crew', 'pullover', 'jacket', 'sweatshirt', 'zip']) && !hasAny(nameText, ['pant', 'jogger', 'short'])
  },
  {
    id: 'womens_fleece',
    label: "Women's fleece",
    predicate: (text) => hasAny(text, ['women', 'womens', "women's", 'ladies']) && has(text, 'fleece')
  },
  {
    id: 'ucla_bruins',
    label: 'UCLA and Bruins licensed items',
    predicate: (text) => hasAny(text, ['ucla', 'bruins', 'university of california', 'california los angeles'])
  }
];

const discoveryQueries = [
  {
    id: 'flannel_pants',
    query: 'flannel pants',
    term_groups: [['flannel'], ['pant', 'pants', 'pajama', 'lounge']]
  },
  {
    id: 'flannel_pant_singular',
    query: 'flannel pant',
    term_groups: [['flannel'], ['pant', 'pants', 'pajama', 'lounge']]
  },
  {
    id: 'ucla_flannel_pants',
    query: 'UCLA flannel pants',
    term_groups: [['ucla', 'bruins', 'california'], ['flannel', 'pant', 'pants', 'pajama', 'lounge']]
  },
  {
    id: 'quarter_zip',
    query: 'quarter zip',
    term_groups: [['quarter', '1/4', 'qtr'], ['zip', 'pullover']]
  },
  {
    id: 'qtr_zip',
    query: 'qtr zip',
    term_groups: [['quarter', '1/4', 'qtr'], ['zip', 'pullover']]
  },
  {
    id: 'ucla_quarter_zip',
    query: 'UCLA quarter zip',
    term_groups: [['ucla', 'bruins', 'california'], ['quarter', '1/4', 'qtr'], ['zip', 'pullover']]
  },
  {
    id: 'womens_fleece',
    query: 'womens fleece',
    term_groups: [['women', 'womens', "women's", 'ladies'], ['fleece']]
  },
  {
    id: 'bruins',
    query: 'Bruins',
    term_groups: [['bruins', 'ucla', 'california']]
  }
];

const renderedQueryIds = new Set([
  'flannel_pants',
  'ucla_flannel_pants',
  'quarter_zip',
  'womens_fleece',
  'bruins'
]);

fs.mkdirSync(screenshotDir, { recursive: true });

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function textKey(text) {
  return normalizeText(text).toLowerCase();
}

function has(text, term) {
  return text.includes(term.toLowerCase());
}

function hasAny(text, terms) {
  return terms.some((term) => has(text, term));
}

function stripHtml(text) {
  return normalizeText((text || '').replace(/<[^>]*>/g, ' '));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function relative(pathname) {
  return pathname.split(path.sep).join('/');
}

function unique(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function median(numbers) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

function money(value) {
  if (!Number.isFinite(value)) return 'not observed';
  return `$${value.toFixed(2)}`;
}

function productText(product) {
  return textKey([
    product.title,
    product.product_type,
    Array.isArray(product.tags) ? product.tags.join(' ') : product.tags,
    stripHtml(product.body_html)
  ].filter(Boolean).join(' '));
}

function productListingText(product) {
  return textKey([
    product.title,
    product.product_type,
    Array.isArray(product.tags) ? product.tags.join(' ') : product.tags
  ].filter(Boolean).join(' '));
}

function productNameText(product) {
  return textKey([
    product.title,
    product.product_type
  ].filter(Boolean).join(' '));
}

function productPrices(product) {
  return (product.variants || [])
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);
}

function productUrl(site, product) {
  return `${site.base_url}/products/${product.handle}`;
}

function productSummary(site, product) {
  const prices = productPrices(product);
  return {
    title: product.title,
    url: productUrl(site, product),
    min_price: prices.length ? Math.min(...prices) : null,
    max_price: prices.length ? Math.max(...prices) : null,
    price_range: prices.length ? `${money(Math.min(...prices))}-${money(Math.max(...prices))}` : 'not observed',
    product_type: product.product_type || null
  };
}

function categoryStats(site, products, category) {
  const matches = products.filter((product) => category.predicate(productListingText(product), productNameText(product)));
  const productMins = matches
    .map((product) => {
      const prices = productPrices(product);
      return prices.length ? Math.min(...prices) : null;
    })
    .filter((price) => Number.isFinite(price));
  const variantPrices = matches.flatMap(productPrices);
  const samples = matches
    .map((product) => productSummary(site, product))
    .sort((a, b) => (a.min_price ?? Number.MAX_SAFE_INTEGER) - (b.min_price ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8);

  return {
    category_id: category.id,
    label: category.label,
    product_count: matches.length,
    priced_product_count: productMins.length,
    variant_price_count: variantPrices.length,
    min_price: variantPrices.length ? Math.min(...variantPrices) : null,
    max_price: variantPrices.length ? Math.max(...variantPrices) : null,
    median_product_min_price: median(productMins),
    price_range: variantPrices.length ? `${money(Math.min(...variantPrices))}-${money(Math.max(...variantPrices))}` : 'not observed',
    samples
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 ecommerce-product-discovery-assessment/0.1'
    },
    ...options
  });
  return response;
}

async function fetchShopifyProducts(site) {
  const products = [];
  const pageStatuses = [];
  for (let page = 1; page <= 30; page += 1) {
    const url = `${site.base_url}/products.json?limit=250&page=${page}`;
    const response = await fetchJson(url);
    pageStatuses.push({ page, status: response.status });
    if (!response.ok) {
      warnings.push(`${site.name} catalog page ${page} returned HTTP ${response.status}`);
      break;
    }
    const data = await response.json();
    const pageProducts = data.products || [];
    if (pageProducts.length === 0) break;
    products.push(...pageProducts);
    if (pageProducts.length < 250) break;
  }
  return {
    status: products.length ? 'available' : 'empty_or_unavailable',
    source: `${site.base_url}/products.json?limit=250&page=N`,
    page_statuses: pageStatuses,
    product_count: products.length,
    products
  };
}

async function checkAccess(site) {
  try {
    const response = await fetch(site.base_url, {
      method: 'HEAD',
      redirect: 'manual',
      headers: { 'user-agent': 'Mozilla/5.0 ecommerce-product-discovery-assessment/0.1' }
    });
    return {
      status: response.status,
      redirected_to: response.headers.get('location') || null
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

function resultCountFromText(text, title = '') {
  for (const candidate of [title, text]) {
    const match = normalizeText(candidate).match(/(\d+)\s+(?:results? found|results?|items?|products?)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function matchesTermGroups(text, termGroups) {
  const lower = textKey(text);
  return termGroups.every((group) => group.some((term) => lower.includes(term.toLowerCase())));
}

function zeroResultText(text) {
  return /\b(no results|0 results|nothing found|no products found|did not match|try another search|we couldn't find)\b/i.test(text);
}

function browsePathFromLinks(links, queryDef) {
  const browseLinks = links.filter((link) => /\/collections\/|\/pages\/|\/products$|\/products\?|\/c\/|\/category\//.test(link.href || ''));
  const relevant = browseLinks.filter((link) => matchesTermGroups(`${link.text} ${link.href}`, queryDef.term_groups.slice(0, 2)));
  return {
    has_browse_path: relevant.length > 0,
    relevant_count: relevant.length,
    relevant_links: relevant.slice(0, 8),
    all_browse_links_sample: browseLinks.slice(0, 8)
  };
}

async function bodyText(page) {
  return normalizeText(await page.locator('body').innerText({ timeout: 2000 }).catch(() => ''));
}

async function visibleTexts(page, selector, limit = 20) {
  return unique(await page.locator(selector).evaluateAll((nodes, max) => nodes
    .filter((node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length))
    .map((node) => node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.value || '')
    .filter(Boolean)
    .slice(0, max), limit).catch(() => []));
}

async function visibleLinks(page, selector = 'a', limit = 160) {
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

async function screenshot(page, siteId, prefix, query = '') {
  const filePath = path.join(screenshotDir, `${siteId}-${prefix}${query ? `-${slug(query)}` : ''}.png`);
  await page.screenshot({ path: filePath, fullPage: false }).catch(() => {});
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  if (stats.size < 1000) warnings.push(`Screenshot appears small: ${filePath}`);
  return relative(filePath);
}

async function dismissPopups(page) {
  const selectors = [
    'button[aria-label*="close" i]',
    'button:has-text("No thanks")',
    'button:has-text("Close")',
    'button:has-text("Accept")',
    'button:has-text("Reject")',
    '[role="button"][aria-label*="close" i]',
    '.needsclick button:has-text("x")',
    '.needsclick button:has-text("X")'
  ];
  for (const selector of selectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 3); index += 1) {
      const button = buttons.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 800 }).catch(() => {});
      }
    }
  }
}

async function goto(page, url, settleMs = 2500) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(settleMs);
  await dismissPopups(page);
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: desktopViewport });
  page.setDefaultTimeout(5000);
  return page;
}

function searchUrl(site, query) {
  if (site.id === 'concepts_sport') return `${site.base_url}/search?q=${encodeURIComponent(query)}`;
  if (site.id === 'fanatics') return `${site.base_url}/search/${encodeURIComponent(query)}`;
  return `${site.base_url}/search?q=${encodeURIComponent(query)}`;
}

const productTitleSelector = [
  '.grid-product__title',
  '.grid-product__title--body',
  '.card__heading a',
  '.product-card__title',
  '.product-item__title',
  '.boost-pfs-filter-product-item-title',
  '[data-product-title]',
  'a[href*="/products/"]'
].join(', ');

function evaluateCatalogSearch(site, products, queryDef) {
  const matches = products.filter((product) => matchesTermGroups(productText(product), queryDef.term_groups));
  return {
    query: queryDef.query,
    status: 'catalog_match',
    url: `${site.base_url}/products.json?limit=250&page=N`,
    result_count: matches.length,
    product_title_count: matches.length,
    has_results: matches.length > 0,
    has_relevant_text: matches.length > 0,
    zero_result_language: false,
    browse_path: {
      has_browse_path: false,
      relevant_count: 0,
      relevant_links: [],
      all_browse_links_sample: []
    },
    product_titles: matches.slice(0, 12).map((product) => product.title),
    evidence_note: 'Structured public catalog match used for full query coverage; rendered site search is sampled separately where feasible.'
  };
}

async function evaluateSearch(browser, site, queryDef) {
  if (site.id === 'fanatics') {
    return {
      query: queryDef.query,
      status: 'skipped_access_limited',
      url: searchUrl(site, queryDef.query),
      reason: 'Marketplace benchmark omitted from rendered direct-brand comparison because the site does not expose a comparable brand-owned catalog feed in this run.'
    };
  }

  const page = await newPage(browser);
  const url = searchUrl(site, queryDef.query);
  try {
    await goto(page, url, site.id === 'concepts_sport' ? 2200 : 1600);
    const title = await page.title().catch(() => '');
    const text = await bodyText(page);
    const productTitles = await visibleTexts(page, productTitleSelector, 24);
    const links = await visibleLinks(page, 'a', 180);
    const relevantText = `${productTitles.join(' ')} ${links.filter((link) => /\/products\//.test(link.href)).map((link) => link.text).join(' ')}`;
    const resultCount = resultCountFromText(text, title);
    const hasResults = (!zeroResultText(text) && productTitles.length > 0) || (Number.isFinite(resultCount) && resultCount > 0);
    const hasRelevantText = hasResults && matchesTermGroups(relevantText, queryDef.term_groups);
    const shot = await screenshot(page, site.id, 'search', queryDef.query);

    return {
      query: queryDef.query,
      status: 'tested',
      url,
      title,
      screenshot: shot,
      result_count: resultCount,
      product_title_count: productTitles.length,
      has_results: hasResults,
      has_relevant_text: hasRelevantText,
      zero_result_language: zeroResultText(text),
      browse_path: browsePathFromLinks(links, queryDef),
      product_titles: productTitles.slice(0, 12),
      visible_text_sample: text.slice(0, 700)
    };
  } catch (error) {
    warnings.push(`${site.name} search "${queryDef.query}" could not be completed: ${error.message}`);
    return {
      query: queryDef.query,
      status: 'error',
      url,
      error: error.message
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  }
  return null;
}

async function openSearchInput(page) {
  const inputSelectors = [
    'input[type="search"]',
    'input[name="q"]',
    'input[placeholder*="search" i]',
    'input[aria-label*="search" i]'
  ];
  let input = await firstVisible(page, inputSelectors);
  if (input) return input;

  const triggerSelectors = [
    'button[aria-label*="search" i]',
    'a[aria-label*="search" i]',
    'summary[aria-label*="search" i]',
    'button:has-text("Search")',
    'a:has-text("Search")',
    'a[href*="/search"]',
    '[class*="search"] button',
    '[class*="search"] a'
  ];
  const trigger = await firstVisible(page, triggerSelectors);
  if (trigger) {
    await trigger.click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(900);
    input = await firstVisible(page, inputSelectors);
  }
  return input;
}

async function evaluateAutocomplete(browser, site, queryDef) {
  if (site.id === 'fanatics') {
    return {
      query: queryDef.query,
      status: 'skipped_access_limited',
      reason: 'Marketplace benchmark omitted from rendered direct-brand comparison.'
    };
  }

  const page = await newPage(browser);
  try {
    await goto(page, site.base_url, site.id === 'concepts_sport' ? 2200 : 1400);
    const input = await openSearchInput(page);
    if (!input) {
      const shot = await screenshot(page, site.id, 'autocomplete-no-input', queryDef.query);
      return {
        query: queryDef.query,
        status: 'no_visible_search_input',
        screenshot: shot,
        has_suggestions: false,
        has_relevant_suggestions: false,
        browse_path: { has_browse_path: false, relevant_count: 0, relevant_links: [], all_browse_links_sample: [] }
      };
    }

    await input.click({ timeout: 1500 }).catch(() => {});
    await input.fill('');
    await input.type(queryDef.query, { delay: 35 });
    await page.waitForTimeout(2300);

    const suggestionSelectors = [
      '[role="listbox"]',
      '[id*="predictive"]',
      '[class*="predictive"]',
      '[id*="suggest"]',
      '[class*="suggest"]',
      '[class*="search-results"]',
      '[class*="search__results"]',
      '[class*="search-modal"]'
    ];
    const suggestionTextParts = [];
    const suggestionLinks = [];
    for (const selector of suggestionSelectors) {
      suggestionTextParts.push(...await visibleTexts(page, selector, 12));
      suggestionLinks.push(...await visibleLinks(page, `${selector} a`, 80));
    }
    const productTitles = unique([
      ...suggestionTextParts,
      ...suggestionLinks.filter((link) => /\/products\//.test(link.href)).map((link) => link.text)
    ]).slice(0, 16);
    const suggestionText = normalizeText(productTitles.join(' '));
    const hasSuggestions = productTitles.length > 0 && !zeroResultText(suggestionText);
    const hasRelevantSuggestions = hasSuggestions && matchesTermGroups(suggestionText, queryDef.term_groups);
    const shot = await screenshot(page, site.id, 'autocomplete', queryDef.query);

    return {
      query: queryDef.query,
      status: 'tested',
      screenshot: shot,
      has_suggestions: hasSuggestions,
      has_relevant_suggestions: hasRelevantSuggestions,
      browse_path: browsePathFromLinks(suggestionLinks, queryDef),
      product_titles: productTitles.slice(0, 12),
      visible_text_sample: suggestionText.slice(0, 700)
    };
  } catch (error) {
    warnings.push(`${site.name} autocomplete "${queryDef.query}" could not be completed: ${error.message}`);
    return {
      query: queryDef.query,
      status: 'error',
      error: error.message
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function evaluateBrowse(browser, site) {
  if (site.id === 'fanatics') {
    return {
      status: 'skipped_access_limited',
      url: site.browse_url,
      reason: 'Marketplace benchmark omitted from rendered direct-brand comparison.'
    };
  }

  const page = await newPage(browser);
  try {
    await goto(page, site.browse_url, site.id === 'concepts_sport' ? 2500 : 1600);
    const text = await bodyText(page);
    const productTitles = await visibleTexts(page, productTitleSelector, 30);
    const links = await visibleLinks(page, 'a', 180);
    const filterText = textKey(text);
    const hasFilters = hasAny(filterText, ['filter', 'size', 'color', 'price', 'category', 'collection', 'gender', 'team']);
    const collectionLinks = links.filter((link) => /\/collections\/|\/products$|\/products\?|\/category\//.test(link.href || '')).slice(0, 16);
    const shot = await screenshot(page, site.id, 'browse');
    return {
      status: 'tested',
      url: site.browse_url,
      screenshot: shot,
      product_title_count: productTitles.length,
      has_catalog_products: productTitles.length > 0,
      has_filter_or_facet_language: hasFilters,
      collection_or_category_links: collectionLinks,
      product_titles: productTitles.slice(0, 12),
      visible_text_sample: text.slice(0, 700)
    };
  } catch (error) {
    warnings.push(`${site.name} browse could not be completed: ${error.message}`);
    return {
      status: 'error',
      url: site.browse_url,
      error: error.message
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function summarizeDiscovery(siteResult) {
  const searchTests = siteResult.discovery_tests
    .map((test) => test.search)
    .filter((test) => ['tested', 'catalog_match', 'catalog_match_with_rendered_sample'].includes(test?.status));
  const autocompleteTests = siteResult.discovery_tests.map((test) => test.autocomplete).filter((test) => test && !test.status?.startsWith('skipped'));
  const testedAutocomplete = autocompleteTests.filter((test) => test.status === 'tested');
  const noInputAutocomplete = autocompleteTests.filter((test) => test.status === 'no_visible_search_input');
  const searchRelevant = searchTests.filter((test) => test.has_relevant_text);
  const autocompleteRelevant = testedAutocomplete.filter((test) => test.has_relevant_suggestions);
  const searchBrowsePaths = searchTests.filter((test) => test.browse_path?.has_browse_path || test.rendered_sample?.browse_path?.has_browse_path);
  const autocompleteBrowsePaths = testedAutocomplete.filter((test) => test.browse_path?.has_browse_path);

  const searchScore = searchTests.length ? Math.round((searchRelevant.length / searchTests.length) * 100) : 0;
  const autocompleteScore = discoveryQueries.length
    ? Math.round((autocompleteRelevant.length / discoveryQueries.length) * 100)
    : 0;
  const browseScore = siteResult.browse_validation?.has_catalog_products
    ? (siteResult.browse_validation?.has_filter_or_facet_language ? 85 : 60)
    : 0;
  const pricingScore = siteResult.price_benchmark?.price_benchmark_available ? 90 : 20;
  const overallScore = Math.round((searchScore * 0.4) + (autocompleteScore * 0.25) + (browseScore * 0.2) + (pricingScore * 0.15));

  return {
    search_relevant_count: searchRelevant.length,
    search_tested_count: searchTests.length,
    search_relevant_rate: searchTests.length ? Number((searchRelevant.length / searchTests.length).toFixed(2)) : null,
    search_score: searchScore,
    autocomplete_relevant_count: autocompleteRelevant.length,
    autocomplete_tested_count: testedAutocomplete.length,
    autocomplete_no_input_count: noInputAutocomplete.length,
    autocomplete_relevant_rate: testedAutocomplete.length ? Number((autocompleteRelevant.length / testedAutocomplete.length).toFixed(2)) : null,
    autocomplete_score: autocompleteScore,
    search_browse_path_count: searchBrowsePaths.length,
    autocomplete_browse_path_count: autocompleteBrowsePaths.length,
    browse_score: browseScore,
    pricing_transparency_score: pricingScore,
    overall_discovery_score: overallScore
  };
}

function buildPriceBenchmark(siteResult, catalogProducts = []) {
  if (!catalogProducts.length) {
    return {
      status: 'not_available',
      source: siteResult.pricing_source,
      price_benchmark_available: false,
      categories: categories.map((category) => ({
        category_id: category.id,
        label: category.label,
        product_count: 0,
        priced_product_count: 0,
        variant_price_count: 0,
        min_price: null,
        max_price: null,
        median_product_min_price: null,
        price_range: 'not observed',
        samples: []
      }))
    };
  }

  return {
    status: 'available',
    source: siteResult.catalog?.source || siteResult.pricing_source,
    price_benchmark_available: true,
    categories: categories.map((category) => categoryStats(siteResult, catalogProducts, category))
  };
}

function summarizeCategoryAcrossSites(results, categoryId) {
  return results.map((siteResult) => {
    const category = siteResult.price_benchmark?.categories?.find((item) => item.category_id === categoryId);
    return {
      site_id: siteResult.id,
      site_name: siteResult.name,
      product_count: category?.product_count ?? 0,
      min_price: category?.min_price ?? null,
      max_price: category?.max_price ?? null,
      median_product_min_price: category?.median_product_min_price ?? null,
      price_range: category?.price_range || 'not observed',
      sample_titles: (category?.samples || []).slice(0, 4).map((sample) => sample.title)
    };
  });
}

function buildFindings(results) {
  const findings = [];
  const boxercraft = results.find((site) => site.id === 'boxercraft');
  const l2 = results.find((site) => site.id === 'l2brands');
  const colosseum = results.find((site) => site.id === 'colosseum');
  const flannelBySite = summarizeCategoryAcrossSites(results, 'flannel_pants');
  const loungeBySite = summarizeCategoryAcrossSites(results, 'lounge_pants_joggers');
  const uclaBySite = summarizeCategoryAcrossSites(results, 'ucla_bruins');

  const boxercraftFlannel = flannelBySite.find((item) => item.site_id === 'boxercraft');
  const competitorFlannelMatches = flannelBySite.filter((item) => item.site_id !== 'boxercraft' && item.product_count > 0);
  if (boxercraftFlannel?.product_count > 0 && competitorFlannelMatches.length === 0) {
    findings.push({
      severity: 'Positive',
      category: 'Assortment And Price Benchmark',
      summary: `Boxercraft is the only tested brand site with public flannel-pant catalog matches; observed Boxercraft flannel pants range ${boxercraftFlannel.price_range}.`,
      evidence: (boxercraft?.price_benchmark?.categories || []).find((item) => item.category_id === 'flannel_pants')?.samples?.map((sample) => sample.url).slice(0, 6) || []
    });
  }

  const boxercraftLounge = loungeBySite.find((item) => item.site_id === 'boxercraft');
  const l2Lounge = loungeBySite.find((item) => item.site_id === 'l2brands');
  const colosseumLounge = loungeBySite.find((item) => item.site_id === 'colosseum');
  if (boxercraftLounge?.product_count && (l2Lounge?.product_count || colosseumLounge?.product_count)) {
    findings.push({
      severity: 'Medium',
      category: 'Comparable Bottoms Pricing',
      summary: `For broader pants/joggers/sweatpants, Boxercraft is ${boxercraftLounge.price_range}; L2 Brands is ${l2Lounge?.price_range || 'not observed'}; Colosseum is ${colosseumLounge?.price_range || 'not observed'}.`,
      evidence: [
        ...(boxercraft?.price_benchmark?.categories || []).find((item) => item.category_id === 'lounge_pants_joggers')?.samples?.map((sample) => sample.url).slice(0, 3) || [],
        ...(l2?.price_benchmark?.categories || []).find((item) => item.category_id === 'lounge_pants_joggers')?.samples?.map((sample) => sample.url).slice(0, 3) || [],
        ...(colosseum?.price_benchmark?.categories || []).find((item) => item.category_id === 'lounge_pants_joggers')?.samples?.map((sample) => sample.url).slice(0, 3) || []
      ]
    });
  }

  const boxercraftUcla = uclaBySite.find((item) => item.site_id === 'boxercraft');
  const colosseumUcla = uclaBySite.find((item) => item.site_id === 'colosseum');
  if ((colosseumUcla?.product_count || 0) > (boxercraftUcla?.product_count || 0)) {
    findings.push({
      severity: 'High',
      category: 'UCLA / Bruins Competitive Visibility',
      summary: `Colosseum exposes more UCLA/Bruins public catalog matches than Boxercraft in the tested direct-site feeds (${colosseumUcla.product_count} vs ${boxercraftUcla?.product_count || 0}).`,
      evidence: [
        ...(colosseum?.price_benchmark?.categories || []).find((item) => item.category_id === 'ucla_bruins')?.samples?.map((sample) => sample.url).slice(0, 6) || [],
        ...(boxercraft?.price_benchmark?.categories || []).find((item) => item.category_id === 'ucla_bruins')?.samples?.map((sample) => sample.url).slice(0, 3) || []
      ]
    });
  }

  for (const site of results.filter((item) => item.id !== 'fanatics')) {
    const summary = site.discovery_summary || {};
    if ((summary.search_relevant_count || 0) > 0 && (summary.autocomplete_relevant_count || 0) < Math.max(1, Math.floor((summary.search_relevant_count || 0) / 2))) {
      findings.push({
        severity: 'High',
        category: 'Search And Autocomplete Parity',
        summary: `${site.name} search returns relevant matches more often than autocomplete in the tested query set (${summary.search_relevant_count}/${summary.search_tested_count} search vs ${summary.autocomplete_relevant_count}/${discoveryQueries.length} autocomplete).`,
        evidence: site.discovery_tests.flatMap((test) => [test.search?.screenshot, test.autocomplete?.screenshot].filter(Boolean)).slice(0, 8)
      });
    }
  }

  const concepts = results.find((site) => site.id === 'concepts_sport');
  if (concepts && concepts.price_benchmark?.status === 'not_available' && !concepts.browse_validation?.has_catalog_products) {
    findings.push({
      severity: 'Medium',
      category: 'Comparable Evidence Limitation',
      summary: 'Concepts Sport is relevant as a licensed lounge/sleepwear competitor, but the public Wix catalog did not expose comparable prices or product-grid titles through this automated run.',
      evidence: [concepts.browse_url]
    });
  }

  const fanatics = results.find((site) => site.id === 'fanatics');
  if (fanatics?.access_check?.status && Number(fanatics.access_check.status) >= 400) {
    findings.push({
      severity: 'Medium',
      category: 'Benchmark Access Limitation',
      summary: `Fanatics was identified as a relevant marketplace benchmark, but automated access returned HTTP ${fanatics.access_check.status}; do not compare its discovery behavior without approved browser/manual evidence.`,
      evidence: [fanatics.base_url]
    });
  }

  return findings;
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => normalizeText(String(column.value(row) ?? '')).replace(/\|/g, '/')).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function buildMarkdown(result) {
  const priceRows = categories.flatMap((category) => summarizeCategoryAcrossSites(result.sites, category.id)
    .map((row) => ({ ...row, category: category.label })));
  const discoveryRows = result.sites.map((site) => ({
    site: site.name,
    search: site.discovery_summary?.search_tested_count
      ? `${site.discovery_summary.search_relevant_count}/${site.discovery_summary.search_tested_count}`
      : 'not tested',
    autocomplete: site.discovery_summary
      ? `${site.discovery_summary.autocomplete_relevant_count}/${discoveryQueries.length}`
      : 'not tested',
    browse: site.browse_validation?.status === 'tested'
      ? `${site.browse_validation.product_title_count} visible product titles; filters: ${site.browse_validation.has_filter_or_facet_language ? 'yes' : 'not obvious'}`
      : site.browse_validation?.status || 'not tested',
    score: site.discovery_summary?.overall_discovery_score ?? 'n/a'
  }));

  const fanaticsStatus = result.sites.find((site) => site.id === 'fanatics')?.access_check?.status;
  const fanaticsLimit = Number(fanaticsStatus) >= 400
    ? 'Fanatics was treated as a marketplace benchmark, but automated access was blocked. Its discovery behavior should be compared only with approved manual or browser evidence.'
    : 'Fanatics was treated as a marketplace benchmark, but this automated run did not compare it as a direct brand-owned catalog because it lacks a comparable public product-feed source in this scope.';

  return `# Boxercraft Competitor Pricing And Discovery Benchmark

Generation: ${generationId}
Completed: ${result.completed_at}

## Scope

This benchmark compares Boxercraft against direct licensed apparel competitors and one marketplace benchmark using public evidence only. Prices are public direct-site catalog/list prices observed during this run, not wholesale or negotiated account pricing.

Competitors tested: ${result.sites.map((site) => site.name).join(', ')}.

## Price Ranges

${markdownTable(priceRows, [
  { label: 'Category', value: (row) => row.category },
  { label: 'Site', value: (row) => row.site_name },
  { label: 'Products', value: (row) => row.product_count },
  { label: 'Range', value: (row) => row.price_range },
  { label: 'Median Min', value: (row) => Number.isFinite(row.median_product_min_price) ? money(row.median_product_min_price) : 'not observed' },
  { label: 'Samples', value: (row) => row.sample_titles.join('; ') || 'none observed' }
])}

## Discovery Performance

${markdownTable(discoveryRows, [
  { label: 'Site', value: (row) => row.site },
  { label: 'Relevant Search', value: (row) => row.search },
  { label: 'Relevant Autocomplete', value: (row) => row.autocomplete },
  { label: 'Browse Evidence', value: (row) => row.browse },
  { label: 'Weighted Score', value: (row) => row.score }
])}

## Findings

${result.findings.map((finding) => `- ${finding.severity}: ${finding.summary}`).join('\n')}

## Evidence Limits

- UCLA/Bruins commercial importance remains stakeholder context unless client-supplied commercial evidence approves stronger language.
- Concepts Sport uses a rendered Wix catalog surface in this run; public prices were not observed through the automated catalog check.
- ${fanaticsLimit}
- Authenticated wholesale pricing, inventory, ordering, and account-specific assortments remain out of scope.
`;
}

const startedAt = new Date().toISOString();
const launchOptions = chromePath
  ? { headless: true, executablePath: chromePath }
  : { headless: true, channel: chromeChannel };

const result = {
  evaluation_id: 'BOXERCRAFT-COMPETITOR-PRICING-DISCOVERY-GEN-006',
  generation_id: generationId,
  started_at: startedAt,
  completed_at: null,
  scope: {
    public_evidence_only: true,
    pricing_note: 'Public direct-site list/catalog prices observed during automation; not wholesale, negotiated, or account-specific pricing.',
    ucla_note: 'UCLA/Bruins importance is stakeholder context, not independently verified public proof of largest-client status.'
  },
  browser: {
    engine: 'chromium',
    executable_path: chromePath || null,
    channel: chromePath ? null : chromeChannel,
    desktop_viewport: desktopViewport
  },
  categories: categories.map(({ id, label }) => ({ id, label })),
  discovery_queries: discoveryQueries,
  sites: [],
  findings: [],
  warnings,
  failures
};

const catalogProductsBySite = new Map();

for (const site of sites) {
  const siteResult = {
    ...site,
    access_check: await checkAccess(site),
    catalog: null,
    price_benchmark: null,
    browse_validation: null,
    discovery_tests: [],
    discovery_summary: null
  };

  if (site.platform === 'shopify') {
    siteResult.catalog = await fetchShopifyProducts(site);
    const catalogProducts = siteResult.catalog.products;
    catalogProductsBySite.set(site.id, catalogProducts);
    delete siteResult.catalog.products;
    siteResult.price_benchmark = buildPriceBenchmark(siteResult, catalogProducts);
  } else {
    siteResult.catalog = {
      status: 'not_structured_shopify_catalog',
      product_count: 0,
      products: []
    };
    siteResult.price_benchmark = buildPriceBenchmark(siteResult, []);
  }

  result.sites.push(siteResult);
}

const browser = await chromium.launch(launchOptions);
try {
  for (const siteResult of result.sites) {
    siteResult.browse_validation = await evaluateBrowse(browser, siteResult);
    for (const queryDef of discoveryQueries) {
      let searchResult;
      if (siteResult.platform === 'shopify') {
        const catalogSearch = evaluateCatalogSearch(siteResult, catalogProductsBySite.get(siteResult.id) || [], queryDef);
        if (renderedQueryIds.has(queryDef.id)) {
          const renderedSearch = await evaluateSearch(browser, siteResult, queryDef);
          searchResult = {
            ...catalogSearch,
            status: 'catalog_match_with_rendered_sample',
            rendered_sample: renderedSearch,
            screenshot: renderedSearch.screenshot || null,
            browse_path: renderedSearch.browse_path || catalogSearch.browse_path
          };
        } else {
          searchResult = catalogSearch;
        }
      } else if (renderedQueryIds.has(queryDef.id)) {
        searchResult = await evaluateSearch(browser, siteResult, queryDef);
      } else {
        searchResult = {
          query: queryDef.query,
          status: siteResult.id === 'fanatics' ? 'skipped_access_limited' : 'not_sampled_rendered_only_site',
          url: searchUrl(siteResult, queryDef.query),
          has_results: false,
          has_relevant_text: false,
          reason: 'Rendered-only site query omitted from the reduced browser sample.'
        };
      }

      const autocompleteResult = renderedQueryIds.has(queryDef.id)
        ? await evaluateAutocomplete(browser, siteResult, queryDef)
        : {
            query: queryDef.query,
            status: siteResult.id === 'fanatics' ? 'skipped_access_limited' : 'not_sampled',
            has_suggestions: false,
            has_relevant_suggestions: false,
            reason: 'Autocomplete was sampled on representative queries only.'
          };

      siteResult.discovery_tests.push({
        query_id: queryDef.id,
        query: queryDef.query,
        search: searchResult,
        autocomplete: autocompleteResult
      });
    }
    siteResult.discovery_summary = summarizeDiscovery(siteResult);
  }
} finally {
  await browser.close().catch(() => {});
}

result.findings = buildFindings(result.sites);
result.completed_at = new Date().toISOString();

const boxercraft = result.sites.find((site) => site.id === 'boxercraft');
const l2 = result.sites.find((site) => site.id === 'l2brands');
const colosseum = result.sites.find((site) => site.id === 'colosseum');
if (!boxercraft?.catalog?.product_count) failures.push('Boxercraft public product catalog was not captured.');
if (!l2?.catalog?.product_count) failures.push('L2 Brands public product catalog was not captured.');
if (!colosseum?.catalog?.product_count) failures.push('Colosseum public product catalog was not captured.');
if (!result.findings.length) warnings.push('No competitor findings were generated; review scoring thresholds.');

fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(summaryPath, buildMarkdown(result));

console.log(`Competitor pricing and discovery evaluation written to ${resultPath}`);
console.log(`Summary written to ${summaryPath}`);
console.log(`Screenshots written to ${screenshotDir}`);
console.log(`Sites evaluated: ${result.sites.length}`);
console.log(`Findings: ${result.findings.length}`);
if (warnings.length > 0) {
  console.log(`Warnings: ${warnings.length}`);
}
if (failures.length > 0) {
  console.error('Competitor pricing and discovery evaluation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Competitor pricing and discovery evaluation passed');
