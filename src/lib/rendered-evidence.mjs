import path from 'node:path';
import { ensureParent } from './fs-json.mjs';

// Platform capability P008: rendered page capture. Drives a real headless
// browser to observe what customers see (rendered result grids, visible
// autocomplete dropdowns) and retains screenshots as immutable evidence.
// Sequential captures with pacing keep the same politeness contract as the
// HTTP evidence fetcher.

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_PACING_MS = 1500;
const SETTLE_MS = 1800;

const SEARCH_TOGGLE_SELECTORS = [
  'button[aria-label*="search" i]',
  'a[aria-label*="search" i]',
  'summary[aria-label*="search" i]',
  '[class*="search-toggle" i]',
  '[data-action="toggle-search"]'
];

const SEARCH_INPUT_SELECTORS = [
  'input[type="search"]',
  'input[name="q"]',
  'input[placeholder*="search" i]',
  'input[aria-label*="search" i]'
];

const SUGGESTION_SELECTORS = [
  '[role="listbox"] [role="option"]',
  'predictive-search li',
  '#predictive-search li',
  '[data-predictive-search] li',
  '.predictive-search li',
  '.search-suggestions li',
  '[class*="autocomplete" i] li'
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyRenderError(error) {
  const message = String(error?.message || error);
  if (/timeout/i.test(message)) {
    return { category: 'infrastructure', code: 'browser_timeout', label: 'Browser timeout' };
  }
  return { category: 'infrastructure', code: 'rendering_failure', label: 'Rendering failure' };
}

// A page can return HTTP 200 while serving a bot/anti-automation wall instead
// of real content. Detecting it keeps "rendered OK" honest.
function botChallengeClassification(title, bodyText) {
  const haystack = `${title || ''} ${bodyText || ''}`.toLowerCase();
  if (/verify you are human|needs to be verified before you can proceed|checking your browser|attention required|cloudflare/.test(haystack)) {
    return { category: 'infrastructure', code: 'bot_challenge', label: 'Bot verification challenge (content not observable)' };
  }
  return null;
}

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export async function createRenderedSession({ userAgent, timeoutMs = DEFAULT_TIMEOUT_MS, pacingMs = DEFAULT_PACING_MS, mobile = false } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    mobile
      ? {
          userAgent: MOBILE_USER_AGENT,
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true
        }
      : {
          userAgent,
          viewport: { width: 1440, height: 900 }
        }
  );
  context.setDefaultTimeout(timeoutMs);

  async function withPage(task) {
    const page = await context.newPage();
    try {
      return await task(page);
    } finally {
      await page.close().catch(() => {});
      await sleep(pacingMs);
    }
  }

  async function extractSearchResults(page) {
    return page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href*="/products/"]')];
      const hrefs = new Set();
      const titles = [];
      for (const anchor of anchors) {
        const href = anchor.getAttribute('href').split('?')[0];
        if (hrefs.has(href)) continue;
        hrefs.add(href);
        const text = (anchor.getAttribute('title') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && text.length > 2 && titles.length < 8) titles.push(text.slice(0, 90));
      }
      const bodyText = document.body.innerText.replace(/\s+/g, ' ');
      const countMatch = bodyText.match(/([\d,]+)\s+(results?|products?|items?)(\s+found)?/i);
      return {
        visible_product_count: hrefs.size,
        sample_product_titles: titles,
        visible_result_count_hint: countMatch ? Number(countMatch[1].replace(/,/g, '')) : null,
        page_title: document.title
      };
    });
  }

  return {
    async captureSearchPage(url, screenshotPath) {
      const startedAt = Date.now();
      try {
        return await withPage(async (page) => {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
          await sleep(SETTLE_MS);
          const observed = await extractSearchResults(page);
          if (screenshotPath) {
            ensureParent(screenshotPath);
            await page.screenshot({ path: screenshotPath, fullPage: false });
          }
          return {
            ok: true,
            status: response?.status() ?? null,
            final_url: page.url(),
            duration_ms: Date.now() - startedAt,
            classification: null,
            observed,
            screenshot: screenshotPath ? path.basename(screenshotPath) : null
          };
        });
      } catch (error) {
        return {
          ok: false,
          status: null,
          final_url: null,
          duration_ms: Date.now() - startedAt,
          classification: classifyRenderError(error),
          observed: null,
          screenshot: null,
          error: String(error?.message || error).slice(0, 300)
        };
      }
    },

    async captureProductPage(url, screenshotPath) {
      const startedAt = Date.now();
      try {
        return await withPage(async (page) => {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
          await sleep(SETTLE_MS);
          const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 400));
          const challenge = botChallengeClassification(await page.title(), bodySnippet);
          const observed = await page.evaluate(() => {
            const text = (selectorList) => {
              for (const selector of selectorList) {
                const node = document.querySelector(selector);
                const value = node && (node.getAttribute('content') || node.innerText || '').replace(/\s+/g, ' ').trim();
                if (value) return value;
              }
              return null;
            };
            // Prefer structured data (JSON-LD / Open Graph) then visible DOM.
            let jsonLdPrice = null;
            let jsonLdAvailability = null;
            for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
              try {
                const parsed = JSON.parse(script.textContent);
                const nodes = Array.isArray(parsed) ? parsed : [parsed];
                for (const node of nodes) {
                  const offers = node.offers && (Array.isArray(node.offers) ? node.offers[0] : node.offers);
                  if (offers?.price != null) jsonLdPrice = String(offers.price);
                  if (offers?.availability) jsonLdAvailability = String(offers.availability);
                }
              } catch {
                // ignore malformed JSON-LD
              }
            }
            const priceText = text(['meta[property="og:price:amount"]', '[itemprop="price"]', '.price__current', '.price-item--regular', '.product__price', '.price']);
            const addToCart = !!document.querySelector('button[name="add"], [type="submit"][name="add"], button[data-add-to-cart], form[action*="/cart/add"] button');
            const variantOptions = document.querySelectorAll('select[name*="option" i], [data-option-index], fieldset[data-product-option], .product-form__input input[type="radio"]').length;
            return {
              page_title: document.title,
              product_title: text(['meta[property="og:title"]', 'h1', '.product__title', '.product-single__title']),
              price: jsonLdPrice || priceText || null,
              availability: jsonLdAvailability || (addToCart ? 'AddToCartPresent' : null),
              image_count: document.querySelectorAll('.product__media img, .product-single__photo img, [class*="product"] img, meta[property="og:image"]').length,
              variant_option_count: variantOptions,
              add_to_cart_present: addToCart
            };
          });
          if (screenshotPath) {
            ensureParent(screenshotPath);
            await page.screenshot({ path: screenshotPath, fullPage: false });
          }
          return {
            ok: !challenge,
            status: response?.status() ?? null,
            final_url: page.url(),
            duration_ms: Date.now() - startedAt,
            classification: challenge,
            observed,
            screenshot: screenshotPath ? path.basename(screenshotPath) : null
          };
        });
      } catch (error) {
        return {
          ok: false,
          status: null,
          final_url: null,
          duration_ms: Date.now() - startedAt,
          classification: classifyRenderError(error),
          observed: null,
          screenshot: null,
          error: String(error?.message || error).slice(0, 300)
        };
      }
    },

    async captureAutocomplete(homepageUrl, query, screenshotPath) {
      const startedAt = Date.now();
      try {
        return await withPage(async (page) => {
          const response = await page.goto(homepageUrl, { waitUntil: 'domcontentloaded' });
          await sleep(SETTLE_MS);

          let input = null;
          for (const selector of SEARCH_INPUT_SELECTORS) {
            const candidate = page.locator(selector).first();
            if ((await candidate.count()) > 0 && (await candidate.isVisible().catch(() => false))) {
              input = candidate;
              break;
            }
          }
          if (!input) {
            for (const toggle of SEARCH_TOGGLE_SELECTORS) {
              const candidate = page.locator(toggle).first();
              if ((await candidate.count()) > 0 && (await candidate.isVisible().catch(() => false))) {
                await candidate.click().catch(() => {});
                await sleep(700);
                break;
              }
            }
            for (const selector of SEARCH_INPUT_SELECTORS) {
              const candidate = page.locator(selector).first();
              if ((await candidate.count()) > 0 && (await candidate.isVisible().catch(() => false))) {
                input = candidate;
                break;
              }
            }
          }
          if (!input) {
            return {
              ok: false,
              status: response?.status() ?? null,
              final_url: page.url(),
              duration_ms: Date.now() - startedAt,
              classification: { category: 'infrastructure', code: 'search_input_not_found', label: 'Visible search input not found' },
              observed: null,
              screenshot: null
            };
          }

          await input.click();
          await input.pressSequentially(query, { delay: 90 });
          await sleep(1600);

          const suggestions = await page.evaluate((selectors) => {
            const visible = (node) => {
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };
            const clean = (nodes) =>
              [...new Set(nodes.map((node) => node.innerText.replace(/\s+/g, ' ').trim()).filter((text) => text && text.length >= 2 && text.length < 120))];

            for (const selector of selectors) {
              const texts = clean([...document.querySelectorAll(selector)].filter(visible));
              if (texts.length > 0) return { selector, texts: texts.slice(0, 10) };
            }
            // Fallback for third-party search apps: scan visible containers whose
            // class/id looks suggestion-related and collect their item texts.
            const containerSelectors = [
              '[class*="suggest" i]', '[id*="suggest" i]',
              '[class*="autocomplete" i]', '[id*="autocomplete" i]',
              '[class*="typeahead" i]', '[class*="predictive" i]',
              '[class*="instant" i]', '[class*="search-flyout" i]'
            ];
            for (const containerSelector of containerSelectors) {
              for (const container of [...document.querySelectorAll(containerSelector)].filter(visible)) {
                const texts = clean([...container.querySelectorAll('a, li, [role="option"]')].filter(visible));
                if (texts.length > 1) return { selector: `${containerSelector} (container fallback)`, texts: texts.slice(0, 10) };
              }
            }
            return { selector: null, texts: [] };
          }, SUGGESTION_SELECTORS);

          if (screenshotPath) {
            ensureParent(screenshotPath);
            await page.screenshot({ path: screenshotPath, fullPage: false });
          }
          return {
            ok: true,
            status: response?.status() ?? null,
            final_url: page.url(),
            duration_ms: Date.now() - startedAt,
            classification: null,
            observed: {
              typed_query: query,
              visible_suggestion_count: suggestions.texts.length,
              visible_suggestions: suggestions.texts,
              suggestion_selector: suggestions.selector
            },
            screenshot: screenshotPath ? path.basename(screenshotPath) : null
          };
        });
      } catch (error) {
        return {
          ok: false,
          status: null,
          final_url: null,
          duration_ms: Date.now() - startedAt,
          classification: classifyRenderError(error),
          observed: null,
          screenshot: null,
          error: String(error?.message || error).slice(0, 300)
        };
      }
    },

    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  };
}
