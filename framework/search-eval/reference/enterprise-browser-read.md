# Capturing search for enterprise / custom-platform retailers (browser-embedded read)

Mass-merchant and big-box sites (Target, Home Depot, Lowe's, Walmart, ...) run **custom React/Next.js platforms behind bot protection**. There is no public Store API to loop and no simple predictive endpoint to replicate. Results are fetched client-side (e.g. Target's **Redsky** API) and rendered in the DOM. The correct, honest method is to **read what a real shopper's browser renders** for a bounded query set — no crawling, no scraping loop, no server load beyond a shopper's own searches.

## Method (Claude-in-Chrome, one query at a time, paced)
1. Navigate to the search URL for the term. Target: `https://www.target.com/s?searchTerm=<url-encoded>`. (HD: `/s/<q>`; Lowe's: `/search?searchTerm=<q>`.)
2. Wait ~4–5s for the grid to hydrate; scroll down a few ticks to trigger lazy render.
3. Read the result count and the top product titles from the DOM. For Target:
```js
(function(){
  var out={count:null,titles:[]};
  var h=document.body.innerText.match(/([\d,]+\+?)\s+results?\s+for/i); if(h) out.count=h[1];
  var els=document.querySelectorAll('[data-test="product-title"]');
  out.titles=[...els].map(e=>e.textContent.trim()).filter(Boolean).slice(0,10);
  return JSON.stringify(out);
})();
```
   - "No results" / a "did you mean" page => total 0 (a zero-result). Verify by reading the page text.
   - The `[data-test="product-title"]` selector is Target-specific; inspect the DOM and set the right selector per retailer.
4. Record per term: `{retailer, dataset, q, total (parsed count or #titles), items:[{i,t}] top-8, note}`. Pace ~1–2s between terms; keep the set bounded (a pilot is dozens of terms, not thousands).

## Notes
- Network tracking (`read_network_requests`) resets on each navigation, so prefer reading the rendered DOM over intercepting the API.
- "1,000+ results" is a display cap; treat coverage as binary (returned something vs zero) plus the graded quality of the top-8. Do not over-read the raw count.
- These sites interleave **sponsored** products; note them — they are ads, not organic relevance. The count/first items may include sponsored tiles.
- Some terms redirect to a curated category/brand page rather than a product grid; that is a *routing* behavior worth recording (good or bad depending on intent).
- Grade the captured top-8 with Cortex exactly as for other platforms (`cortex-submit.mjs` / `cortex-poll.mjs`, pinned rubric).

## Which capture method to use (decision)
- **WooCommerce** => storefront `/?s=` HTML read (`capture-storefront.mjs`).
- **Shopify (custom/headless)** => in-session predictive AND-of-prefix GraphQL (`reference/shopify-predictive-capture.md`).
- **Enterprise custom (Target/HD/Lowe's/Walmart)** => this browser-embedded DOM read.
Always confirm you are reading the **shopper-facing** engine (the #1 validity lesson), never a convenience endpoint.
