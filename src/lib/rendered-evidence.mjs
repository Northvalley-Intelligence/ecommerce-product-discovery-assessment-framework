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

export async function createRenderedSession({ userAgent, timeoutMs = DEFAULT_TIMEOUT_MS, pacingMs = DEFAULT_PACING_MS } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1440, height: 900 }
  });
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
