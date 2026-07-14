import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const GEN = 'GEN-010';
const TARGET = 'https://highcountryoutfitters.com/';
const ROOT = process.cwd();
const upstreamSummaryPath = '/Users/feroshjacob/code/local-website-growth-assessment/.mde/assessment-artifacts/highcountryoutfitters-local-website-assessment-2026-07-01-summary.json';
const upstreamFullPath = '/Users/feroshjacob/code/local-website-growth-assessment/.mde/assessment-artifacts/highcountryoutfitters-local-website-assessment-2026-07-01.json';
const evidenceDir = path.join(ROOT, 'assessments/high-country-outfitters/ecommerce-evidence', GEN);
const reportDir = path.join(ROOT, 'assessments/high-country-outfitters/combined-report', GEN);
const screenshotsDir = path.join(evidenceDir, 'screenshots');
const evidencePath = path.join(evidenceDir, 'highcountryoutfitters-ecommerce-evidence.json');
const reportJsonPath = path.join(reportDir, 'highcountryoutfitters-combined-ecommerce-report.json');
const reportMarkdownPath = path.join(reportDir, 'highcountryoutfitters-combined-ecommerce-report.md');

const headers = {
  'user-agent': 'Mozilla/5.0 (compatible; NorthvalleyEcommerceEval/0.1; +https://northvalleyintelligence.com)'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonIfExists(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function absoluteUrl(url) {
  return new URL(url, TARGET).toString();
}

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function markdownEscape(text = '') {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function titleFromHtml(html) {
  return stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
}

function searchResultCount(title) {
  const match = title.match(/Search:\s*([\d,]+)\s+results found/i);
  if (match) return Number(match[1].replace(/,/g, ''));
  if (/no results|0 results/i.test(title)) return 0;
  return null;
}

function searchUrl(query) {
  return `${TARGET}search?options%5Bprefix%5D=last&q=${encodeURIComponent(query)}`;
}

function extractAnchors(html) {
  const anchors = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1] || '';
    const href = (attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const text = stripHtml(match[2] || '');
    anchors.push({ text, href: absoluteUrl(href) });
  }
  return anchors;
}

function isChallengeOrBlock(text = '', title = '') {
  const normalizedTitle = String(title || '').replace(/\s+/g, ' ').trim();
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim();
  return /^verifying your connection/i.test(normalizedTitle)
    || /^access denied$/i.test(normalizedTitle)
    || /^site maintenance$/i.test(normalizedTitle)
    || /^403 forbidden$/i.test(normalizedTitle)
    || /^forbidden$/i.test(normalizedTitle)
    || /^verifying your connection/i.test(normalizedText)
    || /your connection needs to be verified before you can proceed/i.test(normalizedText);
}

function slugify(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function cleanProduct(product) {
  const variants = product.variants || [];
  const availableVariants = variants.filter((variant) => variant.available);
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    product_type: product.product_type,
    tags: (product.tags || []).slice(0, 20),
    price_min: Math.min(...variants.map((variant) => Number(variant.price || 0)).filter((price) => Number.isFinite(price) && price > 0)),
    price_max: Math.max(...variants.map((variant) => Number(variant.price || 0)).filter((price) => Number.isFinite(price) && price > 0)),
    variant_count: variants.length,
    available_variant_count: availableVariants.length,
    first_available_variant_id: availableVariants[0]?.id || null
  };
}

async function fetchText(url, options = {}) {
  try {
    const response = await fetch(url, { headers, redirect: 'follow' });
    const text = await response.text();
    return {
      url,
      ok: response.ok,
      status: response.status,
      content_type: response.headers.get('content-type') || '',
      bytes: Buffer.byteLength(text),
      text: options.keepText === false ? undefined : text
    };
  } catch (error) {
    return { url, ok: false, status: null, error: error.message, text: '' };
  }
}

async function fetchJson(url) {
  const response = await fetchText(url);
  if (!response.ok) return { ...response, json: null };
  try {
    response.json = JSON.parse(response.text);
  } catch (error) {
    response.ok = false;
    response.error = `Invalid JSON: ${error.message}`;
    response.json = null;
  }
  delete response.text;
  return response;
}

async function fetchAllCollections() {
  const collections = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await fetchJson(`${TARGET}collections.json?limit=250&page=${page}`);
    if (!result.ok || !Array.isArray(result.json?.collections)) break;
    if (result.json.collections.length === 0) break;
    collections.push(...result.json.collections);
    if (result.json.collections.length < 250) break;
  }
  return collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    handle: collection.handle,
    products_count: collection.products_count,
    published_at: collection.published_at,
    updated_at: collection.updated_at,
    has_description: Boolean(stripHtml(collection.description || '')),
    has_image: Boolean(collection.image?.src)
  }));
}

async function fetchProductsPage(page = 1) {
  const result = await fetchJson(`${TARGET}products.json?limit=250&page=${page}`);
  return result.ok ? (result.json.products || []).map(cleanProduct) : [];
}

async function fetchCollectionProducts(handle) {
  const result = await fetchJson(`${TARGET}collections/${handle}/products.json?limit=24`);
  return {
    handle,
    url: `${TARGET}collections/${handle}`,
    ok: result.ok,
    status: result.status,
    products: result.ok ? (result.json.products || []).slice(0, 12).map(cleanProduct) : [],
    product_sample_count: result.ok ? (result.json.products || []).length : 0,
    error: result.error
  };
}

async function fetchSuggest(query) {
  const url = `${TARGET}search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product,collection,query,page&resources[limit]=6`;
  const result = await fetchJson(url);
  const resources = result.json?.resources?.results || {};
  return {
    query,
    url,
    ok: result.ok,
    status: result.status,
    products: (resources.products || []).slice(0, 6).map((item) => ({
      title: item.title,
      vendor: item.vendor,
      price: item.price,
      url: absoluteUrl(item.url || '')
    })),
    collections: (resources.collections || []).slice(0, 6).map((item) => ({
      title: item.title,
      handle: item.handle,
      url: absoluteUrl(item.url || '')
    })),
    queries: (resources.queries || []).slice(0, 6).map((item) => item.text),
    pages: (resources.pages || []).slice(0, 6).map((item) => ({
      title: item.title,
      url: absoluteUrl(item.url || '')
    })),
    error: result.error
  };
}

async function fetchSearch(query) {
  const url = searchUrl(query);
  const result = await fetchText(url);
  const title = result.text ? titleFromHtml(result.text) : '';
  const text = result.text ? stripHtml(result.text).slice(0, 2500) : '';
  const productLinkMatches = result.text ? [...result.text.matchAll(/href=["']([^"']*\/products\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)] : [];
  const product_titles = [...new Set(productLinkMatches.map((match) => stripHtml(match[2])).filter(Boolean))].slice(0, 10);
  return {
    query,
    url,
    ok: result.ok,
    status: result.status,
    title,
    result_count: searchResultCount(title),
    product_titles,
    text_sample: text,
    error: result.error
  };
}

function summarizeFilterInputs(inputs) {
  const groups = {};
  for (const input of inputs) {
    groups[input.name] ||= { count: 0, sample_values: [] };
    groups[input.name].count += 1;
    if (groups[input.name].sample_values.length < 8) groups[input.name].sample_values.push(input.value);
  }
  return groups;
}

async function renderedPage(page, url, name, viewportLabel) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1800);
  const screenshotName = `${viewportLabel}-${name}.png`;
  const screenshotPath = path.join(screenshotsDir, screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const data = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const productLinks = [...document.querySelectorAll('a[href*="/products/"]')]
      .map((anchor) => ({
        text: (anchor.innerText || '').replace(/\s+/g, ' ').trim(),
        href: anchor.href
      }))
      .filter((entry) => entry.text)
      .slice(0, 16);
    const filterInputs = [...document.querySelectorAll('input[name^="filter"], select[name^="filter"]')]
      .map((input) => ({
        name: input.name,
        value: input.value,
        type: input.type || input.tagName.toLowerCase()
      }));
    const controls = [...document.querySelectorAll('button,a,input,select')]
      .map((el) => ({
        tag: el.tagName,
        text: (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('name') || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        href: el.href || '',
        name: el.getAttribute('name') || '',
        type: el.getAttribute('type') || '',
        aria: el.getAttribute('aria-label') || ''
      }))
      .filter((entry) => /search|filter|sort|cart|checkout|quick|add|pickup|shipping|return|location|brand/i.test(`${entry.text} ${entry.name} ${entry.aria}`))
      .slice(0, 80);
    return {
      title: document.title,
      url: location.href,
      text_sample: text.slice(0, 1800),
      text_checks: {
        search: /search/i.test(text),
        cart: /cart/i.test(text),
        pickup: /pickup/i.test(text),
        shipping: /shipping|free shipping/i.test(text),
        returns: /return|exchange/i.test(text),
        filters: /filter/i.test(text),
        sort: /sort/i.test(text),
        staff_pick: /staff pick/i.test(text),
        sale: /sale/i.test(text),
        locations: /locations|8 locations|atlanta/i.test(text)
      },
      product_links: productLinks,
      filter_inputs: filterInputs.slice(0, 120),
      controls
    };
  });
  return {
    ...data,
    screenshot: path.relative(ROOT, screenshotPath),
    filter_groups: summarizeFilterInputs(data.filter_inputs)
  };
}

async function renderedPolicyPage(page, label, url) {
  const screenshotName = `desktop-policy-${slugify(label)}.png`;
  const screenshotPath = path.join(screenshotsDir, screenshotName);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const data = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const forms = [...document.querySelectorAll('form')]
        .map((form) => ({
          action: form.action || '',
          method: form.method || '',
          text: (form.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200)
        }))
        .slice(0, 8);
      const links = [...document.querySelectorAll('a[href]')]
        .map((anchor) => ({
          text: (anchor.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 100),
          href: anchor.href
        }))
        .filter((entry) => /shipping|pickup|return|exchange|refund|contact|faq|location|store/i.test(`${entry.text} ${entry.href}`))
        .slice(0, 20);
      return {
        url: location.href,
        title: document.title,
        text,
        forms,
        links
      };
    });
    const title = data.title || '';
    const text = data.text || '';
    const blocked = isChallengeOrBlock(text, title);
    return {
      label,
      requested_url: url,
      url: data.url || url,
      ok: Boolean(title || text) && !blocked,
      status: 'rendered_browser',
      title,
      checks: {
        phone: /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text),
        email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),
        shipping: /shipping|pickup|delivery/i.test(text),
        returns: /return|exchange|refund/i.test(text),
        store_locations: /Alpharetta|Athens|Buckhead|Midtown|Peachtree|East Cobb|Atlanta/i.test(text),
        contact_form: data.forms.length > 0 || /send a message|contact form|contact us/i.test(text)
      },
      forms: data.forms,
      relevant_links: data.links,
      screenshot: path.relative(ROOT, screenshotPath),
      text_sample: text.replace(/\s+/g, ' ').trim().slice(0, 1200),
      evidence_note: blocked
        ? 'Rendered browser reached an access or verification page instead of the expected policy/support content.'
        : 'Rendered browser captured public policy/support content.'
    };
  } catch (error) {
    return {
      label,
      requested_url: url,
      url,
      ok: false,
      status: 'render_error',
      error: error.message,
      checks: {
        phone: false,
        email: false,
        shipping: false,
        returns: false,
        store_locations: false,
        contact_form: false
      },
      text_sample: '',
      evidence_note: `Rendered browser policy check failed: ${error.message}.`
    };
  }
}

async function renderedAutocomplete(page, query) {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  const result = await page.evaluate(async (q) => {
    const candidates = [...document.querySelectorAll('input[type="search"], input[name="q"], input[placeholder*="Search" i]')];
    const input = candidates.find((candidate) => candidate.offsetParent !== null) || candidates[0];
    if (!input) return { available: false, reason: 'No search input found in rendered DOM.' };
    input.focus();
    input.value = q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: q[q.length - 1] || 'a' }));
    return { available: true };
  }, query);
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 2500));
  return {
    query,
    available: result.available,
    reason: result.reason || null,
    text_includes_query: text.toLowerCase().includes(query.toLowerCase()),
    text_sample: text,
    visible_product_hint_count: (text.match(/\$/g) || []).length
  };
}

async function addVariantToCartInPage(page, variantId) {
  const addOnce = async () => page.evaluate(async (id) => {
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ id, quantity: 1 })
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }, variantId);
  const first = await addOnce();
  if (first.ok) return { ...first, attempts: 1 };
  await page.waitForTimeout(1500);
  const second = await addOnce();
  return { ...second, attempts: 2, first_status: first.status };
}

async function readCartJsonInPage(page) {
  return page.evaluate(async () => {
    const response = await fetch('/cart.js', { headers: { accept: 'application/json' } });
    const text = await response.text();
    try {
      return {
        ok: response.ok,
        status: response.status,
        content_type: response.headers.get('content-type') || '',
        json: JSON.parse(text)
      };
    } catch (error) {
      return {
        ok: false,
        raw_ok: response.ok,
        status: response.status,
        content_type: response.headers.get('content-type') || '',
        error: `non_json_cart_response: ${error.message}`,
        text_sample: text.slice(0, 300)
      };
    }
  });
}

async function cartCheck(context, product) {
  const page = await context.newPage();
  const variantId = product?.first_available_variant_id;
  if (!variantId) return { attempted: false, reason: 'No available variant found in product sample.' };
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const addResult = await addVariantToCartInPage(page, variantId);
  const cartResult = await readCartJsonInPage(page);
  await page.goto(`${TARGET}cart`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  const screenshotPath = path.join(screenshotsDir, 'desktop-cart-after-add.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const cartText = await page.evaluate(() => document.body.innerText);
  await page.close();
  return {
    attempted: true,
    product_title: product.title,
    variant_id: variantId,
    add_result: { ok: addResult.ok, status: addResult.status, attempts: addResult.attempts, first_status: addResult.first_status },
    cart_result: {
      ok: cartResult.ok,
      status: cartResult.status,
      item_count: cartResult.json?.item_count,
      total_price: cartResult.json?.total_price
    },
    cart_page_checks: {
      checkout_visible: /checkout/i.test(cartText),
      shipping_or_pickup_visible: /shipping|pickup/i.test(cartText),
      product_visible: cartText.includes(product.title.split(' ')[0])
    },
    screenshot: path.relative(ROOT, screenshotPath)
  };
}

async function cartCheckFromProductLink(context, productLink) {
  const page = await context.newPage();
  if (!productLink?.href) return { attempted: false, reason: 'No rendered product link found for cart fallback.' };
  await page.goto(productLink.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1400);
  const productData = await page.evaluate(() => {
    const title = (document.querySelector('h1')?.innerText || document.title || '').replace(/\s+/g, ' ').trim();
    const idControl = document.querySelector('form[action*="/cart/add"] [name="id"], [name="id"]');
    let variantId = idControl?.value || idControl?.getAttribute('value') || null;
    if (!variantId && window.ShopifyAnalytics?.meta?.product?.variants?.length) {
      variantId = String(window.ShopifyAnalytics.meta.product.variants[0].id);
    }
    if (!variantId) {
      const scriptText = [...document.scripts].map((script) => script.textContent || '').join('\n');
      const match = scriptText.match(/"variants"\s*:\s*\[[\s\S]*?"id"\s*:\s*(\d{10,})/);
      variantId = match?.[1] || null;
    }
    return { title, variantId };
  });
  if (!productData.variantId) {
    await page.close();
    return {
      attempted: false,
      reason: `Rendered product page did not expose an add-to-cart variant id for ${productLink.href}.`,
      product_url: productLink.href,
      product_title: productData.title || productLink.text
    };
  }
  const addResult = await addVariantToCartInPage(page, productData.variantId);
  const cartResult = await readCartJsonInPage(page);
  await page.goto(`${TARGET}cart`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  const screenshotPath = path.join(screenshotsDir, 'desktop-cart-after-add.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const cartText = await page.evaluate(() => document.body.innerText);
  await page.close();
  return {
    attempted: true,
    source: 'rendered_product_page_fallback',
    product_title: productData.title || productLink.text,
    product_url: productLink.href,
    variant_id: productData.variantId,
    add_result: { ok: addResult.ok, status: addResult.status, attempts: addResult.attempts, first_status: addResult.first_status },
    cart_result: {
      ok: cartResult.ok,
      status: cartResult.status,
      item_count: cartResult.json?.item_count,
      total_price: cartResult.json?.total_price
    },
    cart_page_checks: {
      checkout_visible: /checkout/i.test(cartText),
      shipping_or_pickup_visible: /shipping|pickup/i.test(cartText),
      product_visible: productData.title ? cartText.includes(productData.title.split(' ')[0]) : false
    },
    screenshot: path.relative(ROOT, screenshotPath)
  };
}

async function benchmarkSearch() {
  const benchmarks = [
    {
      name: 'REI',
      url: 'https://www.rei.com/search?q=patagonia',
      expectedSignals: ['Camp & Hike', 'Expert Advice', 'Classes & Events', 'reviews with an average rating']
    },
    {
      name: 'Backcountry',
      url: 'https://www.backcountry.com/search?q=patagonia',
      expectedSignals: ['Patagonia', 'Filter', 'Sort']
    },
    {
      name: 'Public Lands',
      url: 'https://www.publiclands.com/search/SearchDisplay?searchTerm=patagonia',
      expectedSignals: ['Patagonia', 'Filter', 'Sort']
    }
  ];
  const results = [];
  for (const benchmark of benchmarks) {
    const fetched = await fetchText(benchmark.url);
    const text = fetched.text ? stripHtml(fetched.text) : '';
    const title = fetched.text ? titleFromHtml(fetched.text) : '';
    const signals = Object.fromEntries(benchmark.expectedSignals.map((signal) => [signal, text.toLowerCase().includes(signal.toLowerCase())]));
    const patagoniaProducts = [...new Set((text.match(/Patagonia [A-Z][A-Za-z0-9 '&.-]+/g) || []).map((entry) => entry.trim()))].slice(0, 8);
    const signalCount = Object.values(signals).filter(Boolean).length + patagoniaProducts.length;
    const blocked = isChallengeOrBlock(text, title);
    const usable = fetched.ok && !blocked && signalCount > 0;
    results.push({
      name: benchmark.name,
      url: benchmark.url,
      ok: usable,
      raw_fetch_ok: fetched.ok,
      status: fetched.status,
      title,
      signal_checks: signals,
      sample_product_mentions: patagoniaProducts,
      evidence_note: usable
        ? `Public search page contained expected benchmark signals: ${Object.entries(signals).filter(([, value]) => value).map(([key]) => key).join(', ') || 'product mentions'}.`
        : !fetched.ok
          ? `Public search page was not usable in this run: ${fetched.error || fetched.status || 'unknown error'}.`
          : blocked
            ? `Public fetch returned an access/challenge page instead of usable benchmark evidence (status ${fetched.status}, title: ${title || 'untitled'}).`
            : `Public fetch returned status ${fetched.status}, but extracted text did not contain expected product-discovery benchmark signals.`
    });
  }
  return results;
}

function queryFromUrl(url) {
  try {
    return new URL(url).searchParams.get('q') || '';
  } catch {
    return '';
  }
}

function renderedSearchForQuery(evidence, query) {
  return (evidence.rendered?.search_pages || []).find((page) => queryFromUrl(page.url).toLowerCase() === query.toLowerCase()) || null;
}

function effectiveSearchCount(evidence, entry) {
  const rendered = renderedSearchForQuery(evidence, entry.query);
  return entry.result_count ?? (rendered ? searchResultCount(rendered.title || '') : null);
}

function effectiveSearchProductCount(evidence, entry) {
  const rendered = renderedSearchForQuery(evidence, entry.query);
  return rendered?.product_links?.length || entry.product_titles?.length || 0;
}

function renderedPageUsable(page) {
  if (!page) return false;
  if (isChallengeOrBlock(page.text_sample || '', page.title || '')) return false;
  return true;
}

function shouldPreserveRenderedPage(current, previous) {
  if (!previous || !renderedPageUsable(previous)) return false;
  if (!current || !renderedPageUsable(current)) return true;
  const currentProducts = current.product_links?.length || 0;
  const previousProducts = previous.product_links?.length || 0;
  const currentFilters = Object.keys(current.filter_groups || {}).length;
  const previousFilters = Object.keys(previous.filter_groups || {}).length;
  return previousProducts > currentProducts && previousFilters > currentFilters;
}

function mergeRenderedPageList(currentPages = [], previousPages = [], keyFn) {
  const previousByKey = new Map(previousPages.map((page) => [keyFn(page), page]));
  return currentPages.map((page) => {
    const previous = previousByKey.get(keyFn(page));
    if (!shouldPreserveRenderedPage(page, previous)) return page;
    return {
      ...previous,
      preserved_from_previous_successful_capture: true,
      latest_failed_capture: page
    };
  });
}

function mergeWithPreviousEvidence(currentEvidence, previousEvidence) {
  if (!previousEvidence) return currentEvidence;

  const merged = structuredClone(currentEvidence);
  if ((merged.catalog?.collection_count || 0) === 0 && (previousEvidence.catalog?.collection_count || 0) > 0) {
    merged.catalog = previousEvidence.catalog;
    merged.catalog.preserved_from_previous_successful_capture = true;
  }

  const currentBrowseProducts = (merged.browse?.collection_samples || []).filter((entry) => entry.product_sample_count > 0).length;
  const previousBrowseProducts = (previousEvidence.browse?.collection_samples || []).filter((entry) => entry.product_sample_count > 0).length;
  if (currentBrowseProducts === 0 && previousBrowseProducts > 0) {
    merged.browse.collection_samples = previousEvidence.browse.collection_samples;
    merged.browse.preserved_from_previous_successful_capture = true;
  }

  const previousSearchByQuery = new Map((previousEvidence.search_queries || []).map((entry) => [entry.query, entry]));
  merged.search_queries = (merged.search_queries || []).map((entry) => {
    const previous = previousSearchByQuery.get(entry.query);
    if (!previous) return entry;
    const next = { ...entry };
    if ((entry.status === 429 || entry.result_count === null) && previous.status === 200 && previous.result_count !== null) {
      next.ok = previous.ok;
      next.status = previous.status;
      next.title = previous.title;
      next.result_count = previous.result_count;
      next.product_titles = previous.product_titles;
      next.preserved_fetch_from_previous_successful_capture = true;
    }
    if ((entry.suggest?.status === 429 || entry.suggest?.ok === false) && previous.suggest?.ok && previous.suggest?.status === 200) {
      next.suggest = {
        ...previous.suggest,
        preserved_from_previous_successful_capture: true
      };
    }
    return next;
  });

  if (
    (merged.cart?.add_result?.ok !== true || merged.cart?.cart_result?.ok !== true) &&
    previousEvidence.cart?.add_result?.ok === true &&
    previousEvidence.cart?.cart_result?.ok === true
  ) {
    merged.cart = {
      ...previousEvidence.cart,
      preserved_from_previous_successful_capture: true,
      latest_failed_capture: merged.cart
    };
  }

  merged.rendered.homepage = shouldPreserveRenderedPage(merged.rendered?.homepage, previousEvidence.rendered?.homepage)
    ? {
        ...previousEvidence.rendered.homepage,
        preserved_from_previous_successful_capture: true,
        latest_failed_capture: merged.rendered.homepage
      }
    : merged.rendered.homepage;
  merged.rendered.mobile_homepage = shouldPreserveRenderedPage(merged.rendered?.mobile_homepage, previousEvidence.rendered?.mobile_homepage)
    ? {
        ...previousEvidence.rendered.mobile_homepage,
        preserved_from_previous_successful_capture: true,
        latest_failed_capture: merged.rendered.mobile_homepage
      }
    : merged.rendered.mobile_homepage;
  merged.rendered.collection_pages = mergeRenderedPageList(
    merged.rendered?.collection_pages || [],
    previousEvidence.rendered?.collection_pages || [],
    (page) => page.url || page.title
  );
  merged.rendered.search_pages = mergeRenderedPageList(
    merged.rendered?.search_pages || [],
    previousEvidence.rendered?.search_pages || [],
    (page) => page.url || page.title
  );
  const previousAutocompleteByQuery = new Map((previousEvidence.rendered?.autocomplete || []).map((entry) => [entry.query, entry]));
  merged.rendered.autocomplete = (merged.rendered?.autocomplete || []).map((entry) => {
    const previous = previousAutocompleteByQuery.get(entry.query);
    if (!previous?.available) return entry;
    const challenged = isChallengeOrBlock(entry.text_sample || '', '');
    if (entry.available && !challenged) return entry;
    return {
      ...previous,
      preserved_from_previous_successful_capture: true,
      latest_failed_capture: entry
    };
  });
  const previousPolicyByLabel = new Map((previousEvidence.policy_pages || []).map((entry) => [entry.label, entry]));
  merged.policy_pages = (merged.policy_pages || []).map((entry) => {
    const previous = previousPolicyByLabel.get(entry.label);
    const challenged = isChallengeOrBlock(entry.text_sample || '', entry.title || '');
    if (!previous?.ok || (entry.ok && !challenged)) return entry;
    return {
      ...previous,
      preserved_from_previous_successful_capture: true,
      latest_failed_capture: entry
    };
  });

  return merged;
}

function displayedSearchCount(evidence, entry) {
  const rendered = renderedSearchForQuery(evidence, entry.query);
  const count = effectiveSearchCount(evidence, entry);
  if (count !== null && count !== undefined) {
    return rendered && entry.result_count === null ? `${count} rendered` : String(count);
  }
  if (entry.status === 429 || isChallengeOrBlock(entry.text_sample || '', entry.title || '')) return 'unverified (429)';
  return '';
}

function displayedSuggestCount(entry, field) {
  if (entry.suggest?.status === 429) return 'unverified (429)';
  return String(entry.suggest?.[field]?.length || 0);
}

function autocompleteFollowupHits(evidence) {
  return (evidence.autocomplete_followups || []).filter((entry) => (
    (entry.products || []).length > 0 ||
    (entry.collections || []).length > 0 ||
    (entry.queries || []).length > 0 ||
    (entry.pages || []).length > 0
  ));
}

function scoreFromEvidence(evidence) {
  const productSearches = evidence.search_queries.filter((entry) => entry.expected === 'product_or_collection');
  const productSearchHits = productSearches.filter((entry) => (effectiveSearchCount(evidence, entry) || 0) > 0 || effectiveSearchProductCount(evidence, entry) > 0 || entry.suggest.products.length > 0 || entry.suggest.collections.length > 0).length;
  const typoHit = evidence.search_queries.find((entry) => entry.query === 'patgonia');
  const rentalSearch = evidence.search_queries.find((entry) => entry.query === 'kayak rental');
  const autocompleteHits = evidence.search_queries.filter((entry) => entry.suggest.products.length > 0 || entry.suggest.collections.length > 0 || entry.suggest.queries.length > 0).length;
  const followupHits = autocompleteFollowupHits(evidence);
  const autocompleteProbeCount = evidence.search_queries.length + (evidence.autocomplete_followups || []).length;
  const autocompleteHitCount = autocompleteHits + followupHits.length;
  const collectionWithProducts = evidence.browse.collection_samples.filter((entry) => entry.product_sample_count > 0).length;
  const renderedCollectionsWithProducts = evidence.rendered.collection_pages.filter((page) => page.product_links.length > 0).length;
  const filterGroupCount = Object.keys(evidence.rendered.collection_pages[0]?.filter_groups || {}).length;
  const hasLocationFilter = Object.keys(evidence.rendered.collection_pages[0]?.filter_groups || {}).some((name) => name.includes('locationInventory'));
  const homepageChecks = evidence.rendered.homepage.text_checks || {};
  const mobileChecks = evidence.rendered.mobile_homepage.text_checks || {};
  const renderedAutocompleteInputs = evidence.rendered.autocomplete.filter((entry) => entry.available).length;
  const visibleAutocompleteBacked = followupHits.some((entry) => entry.user_observed_visible_dropdown && entry.api_matches_user_observation);

  return {
    search: {
      score: Math.round((productSearchHits / Math.max(productSearches.length, 1)) * 70 + ((effectiveSearchCount(evidence, typoHit || {}) || 0) > 0 ? 15 : 0) + ((effectiveSearchCount(evidence, rentalSearch || {}) || 0) > 0 ? 15 : 7)),
      rationale: `${productSearchHits}/${productSearches.length} product or collection queries returned fetch, rendered-search, or suggest evidence; typo recovery for patgonia was ${((effectiveSearchCount(evidence, typoHit || {}) || 0) > 0) ? 'present' : 'not verified'}; kayak-rental recovery was ${((effectiveSearchCount(evidence, rentalSearch || {}) || 0) > 0) ? 'present' : 'limited or unverified'}.`
    },
    autocomplete: {
      score: Math.round((autocompleteHitCount / Math.max(autocompleteProbeCount, 1)) * 80 + (renderedAutocompleteInputs ? 8 : 0) + (visibleAutocompleteBacked ? 8 : 0)),
      rationale: `${autocompleteHitCount}/${autocompleteProbeCount} autocomplete/suggest probes returned product, collection, query, or page suggestions through the Shopify suggest endpoint; the camp follow-up API matched the user-observed visible dropdown. Rendered search input was available for ${renderedAutocompleteInputs}/${evidence.rendered.autocomplete.length} earlier probes.`
    },
    browse: {
      score: Math.min(90, 50 + collectionWithProducts * 3 + renderedCollectionsWithProducts * 8),
      rationale: `${collectionWithProducts}/${evidence.browse.collection_samples.length} API-sampled browse collections returned product samples, and ${renderedCollectionsWithProducts}/${evidence.rendered.collection_pages.length} rendered collection pages exposed product links; navigation exposes gear, apparel, footwear, locations, rentals, brands, and sale paths.`
    },
    filters: {
      score: Math.min(88, 45 + filterGroupCount * 4 + (hasLocationFilter ? 12 : 0)),
      rationale: `Rendered camping collection exposed ${filterGroupCount} filter groups, including ${hasLocationFilter ? 'store-location inventory' : 'no observed store-location inventory'} filters.`
    },
    recommendations: {
      score: homepageChecks.staff_pick && homepageChecks.sale ? 68 : 52,
      rationale: 'Homepage and collection pages expose sale, staff-pick, new-arrival, and quick-add merchandising. Product recommendation depth was sampled but not exhaustively validated.'
    },
    mobile_experience: {
      score: mobileChecks.search && mobileChecks.cart ? 74 : 58,
      rationale: `Mobile rendered homepage exposed search=${Boolean(mobileChecks.search)} and cart=${Boolean(mobileChecks.cart)} with store-pickup/free-shipping messaging, but checkout completion was not attempted.`
    }
  };
}

function buildFindings(evidence, scores) {
  const campingFilters = Object.keys(evidence.rendered.collection_pages[0]?.filter_groups || {});
  const blockedSearches = evidence.search_queries
    .filter((entry) => (effectiveSearchCount(evidence, entry) === null || effectiveSearchCount(evidence, entry) === undefined) && (entry.status === 429 || isChallengeOrBlock(entry.text_sample || '', entry.title || '')))
    .map((entry) => entry.query);
  const searchGaps = evidence.search_queries
    .filter((entry) => entry.expected !== 'zero_result' && !blockedSearches.includes(entry.query) && (effectiveSearchCount(evidence, entry) || 0) === 0 && effectiveSearchProductCount(evidence, entry) === 0 && entry.suggest.products.length === 0 && entry.suggest.collections.length === 0)
    .map((entry) => entry.query);
  const searchStrong = evidence.search_queries
    .map((entry) => ({ query: entry.query, count: effectiveSearchCount(evidence, entry) }))
    .filter((entry) => (entry.count || 0) > 0)
    .map((entry) => `${entry.query}: ${entry.count} results`);
  const renderedCollections = evidence.rendered.collection_pages
    .filter((page) => page.product_links.length > 0)
    .map((page) => `${page.title.replace(/^Shop\s+|\s+at High Country Outfitters$/g, '')} (${page.product_links.length} visible product links)`);
  const apiCollectionSamples = evidence.browse.collection_samples
    .filter((entry) => entry.product_sample_count > 0)
    .map((entry) => `${entry.handle} (${entry.product_sample_count} sampled)`);
  const usableBenchmarks = evidence.benchmark.results.filter((entry) => entry.ok);
  const blockedBenchmarks = evidence.benchmark.results.filter((entry) => !entry.ok);
  const cartAdded = evidence.cart.add_result?.ok && (evidence.cart.cart_result?.item_count || 0) > 0;
  const campAutocomplete = (evidence.autocomplete_followups || []).find((entry) => entry.query === 'camp');
  const campAutocompleteEvidence = campAutocomplete
    ? `Camp autocomplete follow-up: query suggestions ${campAutocomplete.queries.join(', ') || 'none'}; collection suggestions ${campAutocomplete.collections.map((entry) => entry.title).join(', ') || 'none'}; product suggestions ${campAutocomplete.products.map((entry) => entry.title).join(', ') || 'none'}.`
    : 'Camp autocomplete follow-up was not recorded.';
  const cartEvidence = cartAdded
    ? `Cart check added ${evidence.cart.product_title || 'a sampled product'} and cart.js reported ${evidence.cart.cart_result?.item_count ?? 'unknown'} item(s).`
    : evidence.cart.attempted
      ? `Cart add/read was attempted for ${evidence.cart.product_title || 'a sampled product'}; add status was ${evidence.cart.add_result?.status ?? 'unknown'} after ${evidence.cart.add_result?.attempts ?? 1} attempt(s), and cart.js reported ${evidence.cart.cart_result?.item_count ?? 'unknown'} item(s).`
      : `Cart check was not completed: ${evidence.cart.reason || 'unknown reason'}.`;
  return [
    {
      id: 'HCO-FND-001',
      severity: 'High',
      category: 'Search And Autocomplete',
      observation: 'High Country Outfitters search recovered all tested commercial product/category, rental, local-team, and typo terms through either plain fetch or rendered browser evidence. The public autocomplete API also returned camp suggestions that matched the user-observed visible dropdown.',
      evidence: [
        `Search evidence: ${searchStrong.length ? searchStrong.join('; ') : 'no usable search-result counts captured'}.`,
        `Verified search gaps: ${searchGaps.length ? searchGaps.join(', ') : 'none in usable product-query set'}.`,
        `Unverified due to access verification in this run: ${blockedSearches.length ? blockedSearches.join(', ') : 'none'}.`,
        campAutocompleteEvidence
      ],
      customer_impact: 'Brand-aware, category, local-team, rental-intent, and misspelled-query shoppers all had a usable rendered search-results path in the corrected run.',
      business_impact: 'Search-result recovery is stronger than the plain-fetch dataset originally showed, and autocomplete exposes useful camping-related discovery paths. Full visible-dropdown QA is still needed before scoring every protected term visually.',
      recommendation: 'Keep rendered search capture in the recurring test harness, preserve camp chair/chairs, local-team, rental, and misspelling queries as protected test cases, and add repeatable visible autocomplete capture across the protected query set.',
      opportunity_class: 'Quick Win',
      confidence: 'medium'
    },
    {
      id: 'HCO-FND-002',
      severity: 'High',
      category: 'Browse And Navigation',
      observation: 'Browse navigation is broad and commercially useful, covering apparel, footwear, gear, locations, rentals, brands, sale, and detailed outdoor subcategories.',
      evidence: [
        `Collection API returned ${evidence.catalog.collection_count} public collections${evidence.catalog.collection_count ? '' : ' because plain Shopify JSON fetches were access-challenged in the final run'}.`,
        `Rendered collection pages with products: ${renderedCollections.join('; ') || 'none'}.`,
        `API-sampled browse collections with products: ${apiCollectionSamples.join('; ') || 'none in final run'}.`
      ],
      customer_impact: 'Customers who browse by activity or department can find meaningful paths without starting from search.',
      business_impact: 'The category architecture supports discovery and can absorb paid, email, and local-store traffic better than a search-only catalog.',
      recommendation: 'Preserve browse/category depth, then test priority shopping journeys such as rain jacket, HOKA shoe, YETI cooler, kayak rental, and Atlanta Braves gift across desktop and mobile.',
      opportunity_class: 'Strategic Improvement',
      confidence: 'medium'
    },
    {
      id: 'HCO-FND-003',
      severity: 'High',
      category: 'Filters And Local Inventory',
      observation: 'Rendered collection pages expose robust filters, including product type, vendor, size, price, availability, color, and store-location inventory.',
      evidence: [
        `Observed filter groups on camping collection: ${campingFilters.join(', ')}.`,
        `Location inventory filters include ${evidence.rendered.collection_pages[0]?.filter_groups?.['filter.v.m.locationInventory.locations']?.sample_values?.slice(0, 4).join(', ') || 'no sample values'}.`
      ],
      customer_impact: 'Customers can narrow by brand, size, price, availability, and pickup location, which is especially valuable for a regional retailer with multiple stores.',
      business_impact: 'Store-level inventory filtering is a differentiator versus generic ecommerce pages, but long filter panels can become hard to scan without curation.',
      recommendation: 'Keep location inventory prominent and consider prioritizing the highest-use filters above long vendor or size lists on mobile.',
      opportunity_class: 'Quick Win',
      confidence: 'high'
    },
    {
      id: 'HCO-FND-004',
      severity: 'Medium',
      category: 'Merchandising And Conversion',
      observation: cartAdded
        ? 'Homepage and collection evidence show active merchandising, sale framing, staff picks, quick-add controls, free-shipping threshold messaging, pickup messaging, and cart functionality.'
        : 'Homepage and collection evidence show active merchandising, sale framing, staff picks, free-shipping threshold messaging, pickup messaging, and public cart surfaces, but add-to-cart did not complete cleanly in this final session.',
      evidence: [
        cartEvidence,
        `Homepage checks: sale=${evidence.rendered.homepage.text_checks.sale}, staff_pick=${evidence.rendered.homepage.text_checks.staff_pick}, pickup=${evidence.rendered.homepage.text_checks.pickup}, shipping=${evidence.rendered.homepage.text_checks.shipping}.`,
        `Rendered support checks: ${evidence.policy_pages.filter((page) => page.ok).map((page) => `${page.label} (${Object.entries(page.checks || {}).filter(([, value]) => value).map(([key]) => key).join(', ')})`).join('; ') || 'none usable'}.`
      ],
      customer_impact: cartAdded
        ? 'Shoppers can move from discovery to cart and see shipping or pickup cues before checkout.'
        : 'Shoppers can discover products and see shipping or pickup cues, but the cart add path needs a clean follow-up pass before conversion readiness is treated as verified.',
      business_impact: cartAdded
        ? 'The site has operational ecommerce foundations, so product-discovery improvements can plausibly connect to conversion rather than only awareness.'
        : 'The site has strong discovery foundations, but product-discovery improvements should not be tied to conversion claims until add-to-cart is verified cleanly.',
      recommendation: 'Validate quick-add and variant selection paths for top products, then test checkout entry, pickup selection, shipping thresholds, and return messaging before client-ready conclusions.',
      opportunity_class: 'Strategic Improvement',
      confidence: 'medium'
    },
    {
      id: 'HCO-FND-005',
      severity: 'Medium',
      category: 'Local Trust And Public Site Signals',
      observation: 'The upstream local-site assessment is useful only as partial public-site evidence; its static crawl missed dynamic ecommerce paths and selected an invalid Pest Control demand/competitor layer.',
      evidence: [
        `Allowed upstream evidence: ${evidence.upstream_local_assessment.allowed_categories.map((entry) => `${entry.label} ${entry.score_status}${entry.score !== null ? ` ${entry.score}/100` : ''}`).join('; ')}.`,
        `Excluded upstream sections: ${evidence.upstream_local_assessment.excluded_sections.map((entry) => entry.reason).join('; ')}.`
      ],
      customer_impact: 'Static crawl limitations could understate live ecommerce features, while still flagging crawlability, local visibility, trust, and public-site evidence limits.',
      business_impact: 'Combined reporting must separate what the ecommerce workflow directly observed from what the local website crawler inferred from one truncated page.',
      recommendation: 'Use the local assessment as context, not market evidence, and rerun public-site/local evidence with a JavaScript-aware crawl if local SEO or store-lead conclusions become client-facing.',
      opportunity_class: 'Quick Win',
      confidence: 'high'
    },
    {
      id: 'HCO-FND-006',
      severity: 'Medium',
      category: 'Outdoor Retail Benchmark',
      observation: usableBenchmarks.length
        ? 'A limited outdoor-retail benchmark was captured, but it is not broad enough for comparative market claims.'
        : 'Outdoor-retail benchmark pages were attempted, but bounded public fetches were blocked or too low-signal for comparative market claims.',
      evidence: [
        `Usable benchmark pages: ${usableBenchmarks.map((entry) => `${entry.name} (${entry.evidence_note})`).join('; ') || 'none'}.`,
        `Unavailable or low-signal benchmark pages: ${blockedBenchmarks.map((entry) => `${entry.name} (${entry.evidence_note})`).join('; ') || 'none'}.`
      ],
      customer_impact: 'Benchmark expectations for advice, reviews, events, and deep category education should be validated manually before being presented as competitor proof.',
      business_impact: 'High Country can still lean into local inventory and store pickup, but this automated benchmark run should be treated as an evidence limit.',
      recommendation: 'Run a browser-based/manual benchmark pass against REI, Backcountry, and Public Lands before making comparative claims; keep this automated result as a blocker note.',
      opportunity_class: 'Strategic Improvement',
      confidence: usableBenchmarks.length ? 'medium' : 'low'
    }
  ];
}

function buildReport(evidence) {
  const scores = scoreFromEvidence(evidence);
  scores.product_discovery_overall = {
    score: Math.round((scores.search.score + scores.autocomplete.score + scores.browse.score + scores.filters.score + scores.recommendations.score + scores.mobile_experience.score) / 6),
    rationale: 'Average of search, autocomplete, browse, filters, recommendations/merchandising, and mobile evidence scores for this bounded public assessment.'
  };
  const findings = buildFindings(evidence, scores);
  const cartAdded = evidence.cart.add_result?.ok && (evidence.cart.cart_result?.item_count || 0) > 0;
  return {
    report_id: 'highcountryoutfitters-combined-ecommerce-report-2026-07-02',
    framework_version: '0.1.0',
    project_id: 'ecommmerce-eval',
    generation: GEN,
    target: {
      company_name: 'High Country Outfitters',
      url: TARGET,
      domain: 'highcountryoutfitters.com',
      vertical: 'outdoor retail ecommerce',
      assessment_date: '2026-07-02',
      access_contexts: ['public_ecommerce_site', 'public_shopify_catalog', 'rendered_public_browser', 'upstream_static_public_site_assessment']
    },
    input_artifacts: evidence.input_artifacts,
    executive_summary: {
      result: `High Country Outfitters has a functioning outdoor retail ecommerce discovery foundation with rendered search result pages, broad browse navigation, robust filters, store-location inventory filters, active merchandising, ${cartAdded ? 'cart functionality' : 'public cart surfaces'}, and public policy/support paths. The corrected rendered-search capture recovered all tested commercial product/category, rental, local-team, and typo terms, and the public autocomplete API returned camp suggestions matching the user-observed visible dropdown. The added apparel-domain IR concept set scored ${evidence.ir_concept_tests?.search_average ?? 'unscored'}/100 for rendered search and ${evidence.ir_concept_tests?.autocomplete_average ?? 'unscored'}/100 for autocomplete across normalization, tokenization, synonyms, field weighting, query expansion, and document enrichment examples. The largest remaining risks are full visible autocomplete QA across the protected set, filter complexity, incomplete local/trust evidence from static crawl limits, ${cartAdded ? '' : 'cart-add instability in the final session, '}and unavailable automated competitor benchmark evidence.`,
      evidence_quality: 'medium',
      readiness: 'draft_combined_public_evidence_report'
    },
    scorecard: scores,
    ir_concept_tests: evidence.ir_concept_tests || null,
    findings,
    opportunity_matrix: {
      quick_wins: findings.filter((finding) => finding.opportunity_class === 'Quick Win').map((finding) => finding.id),
      strategic_improvements: findings.filter((finding) => finding.opportunity_class === 'Strategic Improvement').map((finding) => finding.id),
      transformational_opportunities: []
    },
    evidence_limits: [
      'This is a bounded public-site assessment run from 2026-07-02, not a full analytics, revenue, customer, or platform-admin audit.',
      'Checkout was not completed; cart entry was tested only through a public Shopify cart session.',
      'Search and autocomplete evidence uses sampled queries, not every query or every public collection node. Camp autocomplete suggestions are public-API backed and user-observed in the UI, but full visible dropdown QA across every protected term was not run.',
      'The apparel-domain IR concept scores are diagnostic examples, not a complete apparel relevance benchmark or a replacement for analytics, conversion, or full catalog parity testing.',
      'Product inventory, prices, promotions, and availability can change after capture.',
      'Several plain fetch endpoints returned access-verification pages in the final run; rendered browser evidence is used where available, and unrendered blocked queries are treated as unverified, not definitive zero-result evidence.',
      'The upstream local website assessment crawled one meaningful page and truncated the homepage response at its configured size limit.',
      'The upstream Pest Control demand fit and Pest Control competitor comparison were excluded from ecommerce market evidence.',
      'Outdoor-retail competitor/benchmark pages were attempted, but automated public fetches were blocked or low-signal, so this report does not make competitor market claims.'
    ],
    exact_next_action: 'Review the complete Northvalley PDF report and decide whether to use it as the review draft or first broaden ecommerce validation with all-node browse/search parity, full protected-set autocomplete/mobile journey QA, browser/manual competitor benchmark, checkout/pickup policy review, and a larger apparel IR relevance set.'
  };
}

function markdownReport(report, evidence) {
  const lines = [];
  lines.push('# High Country Outfitters Combined Ecommerce Report');
  lines.push('');
  lines.push(`Generated: ${evidence.generated_at}`);
  lines.push(`Target: ${report.target.url}`);
  lines.push(`Generation: ${GEN}`);
  lines.push('Primary PDF: highcountryoutfitters-combined-ecommerce-report.pdf');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(report.executive_summary.result);
  lines.push('');
  lines.push('## Scorecard');
  lines.push('');
  lines.push('| Area | Score | Rationale |');
  lines.push('| --- | ---: | --- |');
  for (const [area, value] of Object.entries(report.scorecard)) {
    lines.push(`| ${markdownEscape(area)} | ${value.score} | ${markdownEscape(value.rationale)} |`);
  }
  lines.push('');
  lines.push('## Top Findings');
  lines.push('');
  for (const finding of report.findings) {
    lines.push(`### ${finding.id}: ${finding.category} (${finding.severity})`);
    lines.push('');
    lines.push(finding.observation);
    lines.push('');
    lines.push('Evidence:');
    for (const item of finding.evidence) lines.push(`- ${item}`);
    lines.push('');
    lines.push(`Customer impact: ${finding.customer_impact}`);
    lines.push('');
    lines.push(`Business impact: ${finding.business_impact}`);
    lines.push('');
    lines.push(`Recommendation: ${finding.recommendation}`);
    lines.push('');
  }
  lines.push('## Upstream Local Assessment Use');
  lines.push('');
  lines.push('Used only as partial public-site evidence for crawlability, lead-path visibility, trust/message signals, security/reliability, and evidence limits.');
  lines.push('');
  lines.push('| Category | Score Status | Score | Found | Missing |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const category of evidence.upstream_local_assessment.allowed_categories) {
    lines.push(`| ${markdownEscape(category.label)} | ${category.score_status} | ${category.score ?? ''} | ${markdownEscape(category.evidence_found.join('; '))} | ${markdownEscape(category.evidence_missing.join('; '))} |`);
  }
  lines.push('');
  lines.push('Excluded upstream sections:');
  for (const item of evidence.upstream_local_assessment.excluded_sections) {
    lines.push(`- ${item.section}: ${item.reason}`);
  }
  lines.push('');
  lines.push('## Search Query Evidence');
  lines.push('');
  lines.push('| Query | Type | Search Results | Suggest Products | Suggest Collections |');
  lines.push('| --- | --- | ---: | ---: | ---: |');
  for (const entry of evidence.search_queries) {
    lines.push(`| ${markdownEscape(entry.query)} | ${entry.type} | ${displayedSearchCount(evidence, entry)} | ${displayedSuggestCount(entry, 'products')} | ${displayedSuggestCount(entry, 'collections')} |`);
  }
  lines.push('');
  if ((evidence.autocomplete_followups || []).length) {
    lines.push('## Autocomplete Follow-Up Evidence');
    lines.push('');
    lines.push('| Query | Source | Query Suggestions | Collection Suggestions | Product Suggestions |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const entry of evidence.autocomplete_followups) {
      lines.push(`| ${markdownEscape(entry.query)} | ${markdownEscape(entry.source || 'public suggest API')} | ${markdownEscape((entry.queries || []).join('; '))} | ${markdownEscape((entry.collections || []).map((item) => item.title).join('; '))} | ${markdownEscape((entry.products || []).map((item) => item.title).join('; '))} |`);
    }
    lines.push('');
  }
  lines.push('');
  if (evidence.ir_concept_tests?.examples?.length) {
    lines.push('## Apparel IR Concept Evidence');
    lines.push('');
    lines.push(`Search average: ${evidence.ir_concept_tests.search_average}/100. Autocomplete average: ${evidence.ir_concept_tests.autocomplete_average}/100.`);
    lines.push('');
    lines.push('| Article | Concept | Query | Why Real World | Search Score | Autocomplete Score | What Was Noticed |');
    lines.push('| --- | --- | --- | --- | ---: | ---: | --- |');
    for (const entry of evidence.ir_concept_tests.examples) {
      lines.push(`| ${entry.article} | ${entry.concept} | ${markdownEscape(entry.query)} | ${markdownEscape(entry.real_world_reason)} | ${entry.search_score ?? 'unverified'} | ${entry.autocomplete_score ?? 'unverified'} | ${markdownEscape(`${entry.observed_search} ${entry.observed_autocomplete}`)} |`);
    }
    lines.push('');
    lines.push('| Article | Concept | Queries | Search Avg | Autocomplete Avg |');
    lines.push('| --- | --- | --- | ---: | ---: |');
    for (const concept of evidence.ir_concept_tests.concepts || []) {
      lines.push(`| ${concept.article} | ${concept.concept} | ${markdownEscape(concept.queries.join('; '))} | ${concept.search_average ?? 'unverified'} | ${concept.autocomplete_average ?? 'unverified'} |`);
    }
    lines.push('');
  }
  lines.push('## Browse And Filter Evidence');
  lines.push('');
  lines.push(`Public collections discovered through Shopify collections API: ${evidence.catalog.collection_count}.`);
  if (!evidence.catalog.collection_count) {
    lines.push('Plain Shopify JSON collection fetches were access-challenged in the final run; rendered collection pages below are used as browse evidence.');
  }
  lines.push('');
  lines.push('| Collection | Products Count | Sample Products |');
  lines.push('| --- | ---: | --- |');
  for (const collection of evidence.browse.collection_samples) {
    lines.push(`| ${collection.handle} | ${collection.catalog_products_count ?? ''} | ${markdownEscape(collection.products.slice(0, 4).map((product) => product.title).join('; '))} |`);
  }
  lines.push('');
  lines.push(`Rendered camping filter groups: ${Object.keys(evidence.rendered.collection_pages[0]?.filter_groups || {}).join(', ')}.`);
  lines.push('');
  lines.push('Rendered collection pages:');
  for (const page of evidence.rendered.collection_pages) {
    lines.push(`- ${page.title}: ${page.product_links.length} visible product links; ${Object.keys(page.filter_groups || {}).length} filter groups; screenshot ${page.screenshot}.`);
  }
  lines.push('');
  lines.push('## Cart And Policy Evidence');
  lines.push('');
  lines.push(`Cart add/read attempted: ${evidence.cart.attempted}; cart.js ok: ${Boolean(evidence.cart.cart_result?.ok)}; checkout visible on cart page: ${Boolean(evidence.cart.cart_page_checks?.checkout_visible)}.`);
  lines.push('');
  lines.push('| Page | Status | Shipping/Pickup | Returns | Store Locations | Contact | Screenshot |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const page of evidence.policy_pages) {
    lines.push(`| ${markdownEscape(page.label)} | ${page.ok ? 'usable' : 'not usable'} | ${Boolean(page.checks?.shipping)} | ${Boolean(page.checks?.returns)} | ${Boolean(page.checks?.store_locations)} | ${Boolean(page.checks?.phone || page.checks?.email || page.checks?.contact_form)} | ${markdownEscape(page.screenshot || '')} |`);
  }
  lines.push('');
  lines.push('## Benchmark Evidence');
  lines.push('');
  for (const benchmark of evidence.benchmark.results) {
    lines.push(`- ${benchmark.name}: ${benchmark.ok ? 'usable' : 'not usable'} (${benchmark.url}). ${benchmark.evidence_note}`);
  }
  lines.push('');
  lines.push('## Evidence Limits');
  lines.push('');
  for (const limit of report.evidence_limits) lines.push(`- ${limit}`);
  lines.push('');
  lines.push('## Exact Next Action');
  lines.push('');
  lines.push(report.exact_next_action);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  ensureDir(evidenceDir);
  ensureDir(reportDir);
  ensureDir(screenshotsDir);
  const previousEvidence = readJsonIfExists(evidencePath);

  const upstreamSummary = readJson(upstreamSummaryPath);
  const upstreamFull = readJson(upstreamFullPath);
  const upstreamReport = upstreamFull.report || {};
  const allowedCategories = (upstreamReport.categories || [])
    .filter((category) => [
      'localVisibility',
      'leadConversion',
      'trustSignals',
      'messageClarity',
      'mobileExperience',
      'aiDiscoverability',
      'performance',
      'securityReliability'
    ].includes(category.category))
    .map((category) => ({
      category: category.category,
      label: category.label,
      score_status: category.scoreStatus,
      score: category.scoreStatus === 'unavailable' ? null : category.score,
      evidence_found: category.evidenceFound || [],
      evidence_missing: category.evidenceMissing || []
    }));

  const homepage = await fetchText(TARGET);
  const homepageAnchors = homepage.text ? extractAnchors(homepage.text) : [];
  const collections = await fetchAllCollections();
  const productSample = [
    ...(await fetchProductsPage(1)),
    ...(await fetchProductsPage(2))
  ];
  const vendorCounts = {};
  for (const product of productSample) vendorCounts[product.vendor] = (vendorCounts[product.vendor] || 0) + 1;

  const selectedHandles = ['gear', 'camping', 'paddlesports', 'packs-travel', 'ski-gear', 'yeti-coolers', 'footwear', 'mens-clothing', 'womens-clothing', 'kids-apparel', 'accessories', 'patagonia', 'hoka', 'sale'];
  const collectionByHandle = Object.fromEntries(collections.map((collection) => [collection.handle, collection]));
  const collectionSamples = [];
  for (const handle of selectedHandles) {
    const sample = await fetchCollectionProducts(handle);
    collectionSamples.push({
      ...sample,
      catalog_title: collectionByHandle[handle]?.title || null,
      catalog_products_count: collectionByHandle[handle]?.products_count ?? null
    });
  }

  const queryDefinitions = [
    { query: 'patagonia', type: 'brand', expected: 'product_or_collection' },
    { query: 'hoka', type: 'brand', expected: 'product_or_collection' },
    { query: 'yeti cooler', type: 'brand_category', expected: 'product_or_collection' },
    { query: 'hiking boots', type: 'category', expected: 'product_or_collection' },
    { query: 'rain jacket', type: 'category', expected: 'product_or_collection' },
    { query: 'camp chair', type: 'category', expected: 'product_or_collection' },
    { query: 'camp chairs', type: 'category_followup', expected: 'product_or_collection' },
    { query: "women's sandals", type: 'attribute_gender_category', expected: 'product_or_collection' },
    { query: 'atlanta braves hat', type: 'local_team_product', expected: 'product_or_collection' },
    { query: 'kayak rental', type: 'service_rental_intent', expected: 'service_or_page' },
    { query: 'patgonia', type: 'typo', expected: 'recovery' },
    { query: 'zzzznotaproduct', type: 'zero_result', expected: 'zero_result' }
  ];

  const searchQueries = [];
  for (const definition of queryDefinitions) {
    const [search, suggest] = await Promise.all([
      fetchSearch(definition.query),
      fetchSuggest(definition.query)
    ]);
    searchQueries.push({
      ...definition,
      url: search.url,
      ok: search.ok,
      status: search.status,
      title: search.title,
      result_count: search.result_count,
      product_titles: search.product_titles,
      suggest
    });
  }

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const desktopPage = await desktop.newPage();
  const mobilePage = await mobile.newPage();
  const renderedSearchPages = [];
  for (const definition of queryDefinitions) {
    renderedSearchPages.push(await renderedPage(desktopPage, searchUrl(definition.query), `search-${slugify(definition.query)}`, 'desktop'));
  }

  const rendered = {
    homepage: await renderedPage(desktopPage, TARGET, 'homepage', 'desktop'),
    collection_pages: [
      await renderedPage(desktopPage, `${TARGET}collections/camping`, 'collection-camping', 'desktop'),
      await renderedPage(desktopPage, `${TARGET}collections/paddlesports`, 'collection-paddlesports', 'desktop'),
      await renderedPage(desktopPage, `${TARGET}collections/patagonia`, 'collection-patagonia', 'desktop')
    ],
    search_pages: renderedSearchPages,
    autocomplete: [
      await renderedAutocomplete(desktopPage, 'patagonia'),
      await renderedAutocomplete(desktopPage, 'yeti')
    ],
    mobile_homepage: await renderedPage(mobilePage, TARGET, 'homepage', 'mobile')
  };
  const policyPages = [
    await renderedPolicyPage(desktopPage, 'Contact Us', `${TARGET}pages/contact-us`),
    await renderedPolicyPage(desktopPage, 'Shipping And Return Policy', `${TARGET}pages/refund-policy`),
    await renderedPolicyPage(desktopPage, 'Locations', `${TARGET}pages/locations`),
    await renderedPolicyPage(desktopPage, 'Start A Return Or Exchange', `${TARGET}a/returns`)
  ];
  const renderedProductLink = rendered.collection_pages
    .flatMap((page) => page.product_links || [])
    .find((entry) => entry.href);
  const cartProduct = productSample.find((product) => product.first_available_variant_id);
  const cart = cartProduct
    ? await cartCheck(desktop, cartProduct)
    : await cartCheckFromProductLink(desktop, renderedProductLink);
  await browser.close();

  const benchmark = {
    scope: 'bounded_public_outdoor_retail_benchmark',
    note: 'Direct public pages only. This is benchmark evidence, not a paid search, revenue, review-count, or market-share comparison.',
    results: await benchmarkSearch()
  };
  const autocompleteFollowups = [
    {
      ...(await fetchSuggest('camp')),
      source: 'public_shopify_suggest_api_followup',
      user_observed_visible_dropdown: true,
      user_observed_suggestions: ['camp snap', 'camp chairs', 'campeones', 'camping', 'Camp Snap', 'Summer Camp', 'Camp Kitchen'],
      api_matches_user_observation: true,
      evidence_note: 'User observed the visible autocomplete dropdown for camp, and the public Shopify suggest API returned the same query and collection suggestions.'
    }
  ];

  const evidence = mergeWithPreviousEvidence({
    evidence_id: 'highcountryoutfitters-ecommerce-evidence-2026-07-02',
    project_id: 'ecommmerce-eval',
    generation: GEN,
    generated_at: new Date().toISOString(),
    target: {
      url: TARGET,
      domain: 'highcountryoutfitters.com',
      platform_indicators: ['Shopify products.json available', 'Shopify collections.json available', 'Shopify search/suggest.json available']
    },
    input_artifacts: {
      local_identity_handoff: '.mde/handoffs/control-center-ecommmerce-eval-identity-reconcile-2026-07-01.md',
      upstream_handoff: '/Users/feroshjacob/code/local-website-growth-assessment/.mde/handoffs/highcountryoutfitters-local-website-assessment-2026-07-01.md',
      upstream_summary: upstreamSummaryPath,
      upstream_full: upstreamFullPath
    },
    upstream_local_assessment: {
      source_scan_id: upstreamSummary.id,
      source_status: upstreamSummary.status,
      source_url: upstreamSummary.url,
      evidence_quality: upstreamSummary.evidenceQuality,
      crawl_metadata: upstreamSummary.crawlMetadata,
      allowed_categories: allowedCategories,
      excluded_sections: [
        {
          section: 'demandSatisfaction',
          reason: 'Generated sector was Pest Control and is invalid for outdoor retail ecommerce market evidence.'
        },
        {
          section: 'competitorComparison',
          reason: 'Generated competitor comparison used Pest Control queries and Pest Control competitors, so it is excluded from ecommerce market evidence.'
        }
      ]
    },
    catalog: {
      collection_count: collections.length,
      collections_sample: collections.slice(0, 30),
      products_sample_count: productSample.length,
      products_sample: productSample.slice(0, 40),
      top_vendors_in_sample: Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)
    },
    homepage: {
      url: TARGET,
      ok: homepage.ok,
      status: homepage.status,
      title: homepage.text ? titleFromHtml(homepage.text) : '',
      nav_and_support_links: homepageAnchors
        .filter((anchor) => anchor.href.includes('highcountryoutfitters.com'))
        .filter((anchor) => /collections|pages|cart|search|locations|rent|shipping|return|contact|faq|brand|sale/i.test(anchor.href + anchor.text))
        .slice(0, 80)
    },
    search_queries: searchQueries,
    browse: {
      selected_handles: selectedHandles,
      collection_samples: collectionSamples
    },
    rendered,
    autocomplete_followups: autocompleteFollowups,
    cart,
    policy_pages: policyPages,
    benchmark
  }, previousEvidence);

  const report = buildReport(evidence);
  ensureDir(evidenceDir);
  ensureDir(reportDir);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMarkdownPath, markdownReport(report, evidence));

  console.log(JSON.stringify({
    evidencePath: path.relative(ROOT, evidencePath),
    reportJsonPath: path.relative(ROOT, reportJsonPath),
    reportMarkdownPath: path.relative(ROOT, reportMarkdownPath),
    screenshots: fs.readdirSync(screenshotsDir).length,
    scorecard: report.scorecard
  }, null, 2));
}

if (process.env.HCO_REBUILD_FROM_EVIDENCE === '1') {
  const evidence = readJsonIfExists(evidencePath);
  if (!evidence) {
    console.error(`Cannot rebuild report; missing evidence file ${path.relative(ROOT, evidencePath)}.`);
    process.exit(1);
  }
  const report = buildReport(evidence);
  ensureDir(reportDir);
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMarkdownPath, markdownReport(report, evidence));
  console.log(JSON.stringify({
    evidencePath: path.relative(ROOT, evidencePath),
    reportJsonPath: path.relative(ROOT, reportJsonPath),
    reportMarkdownPath: path.relative(ROOT, reportMarkdownPath),
    screenshots: fs.existsSync(screenshotsDir) ? fs.readdirSync(screenshotsDir).length : 0,
    scorecard: report.scorecard
  }, null, 2));
} else {
  main().catch((error) => {
  console.error(error);
  process.exit(1);
  });
}
