# Capturing a Shopify store's REAL predictive search

Shopify custom/headless themes usually search via the **Storefront GraphQL** `products(query:)` — but the search box does **not** pass the raw phrase. It builds a strict **AND-of-prefix** query per word. You must replicate that exact construction, or you measure a much fuzzier engine than shoppers see.

Confirmed example (Seven Bonde): typing `sofa` sent
```
variables.query = "(title:sofa* OR product_type:sofa* OR vendor:sofa* OR tag:sofa*)"
variables.first = 8
```
and `coffee table` → the two words ANDed:
```
"(title:coffee* OR product_type:coffee* OR vendor:coffee* OR tag:coffee*) AND (title:table* OR product_type:table* OR vendor:table* OR tag:table*)"
```
A loose `products(query:"coffee table")` returned a false-positive ottoman that the real search correctly excludes. Always confirm the exact request in-session.

## Procedure (Claude-in-Chrome, in-session — no bot bypass)
1. Navigate to the store. Install a one-shot `fetch` interceptor to capture the search request (URL, token, body):
```js
window.__cap=null; if(!window.__origFetch){window.__origFetch=window.fetch;}
window.fetch=function(u,o){ try{ if(String(u).includes('graphql') && o && o.body){
  window.__cap={url:String(u), token:(o.headers&&(o.headers['X-Shopify-Storefront-Access-Token']||o.headers['x-shopify-storefront-access-token'])), body:o.body}; } }catch(e){}
  return window.__origFetch.apply(this,arguments); };
```
2. Click the search icon and type one clean term (clear the field first). Read `JSON.parse(window.__cap.body).variables.query` to confirm the exact construction, and note `first` (usually 8 — the predictive dropdown).
3. Loop the query pack in-page, replicating the construction, using the site's own token (never printed — used in-session):
```js
const build = (term) => term.trim().split(/\s+/).filter(Boolean)
  .map(w => '(title:'+w+'* OR product_type:'+w+'* OR vendor:'+w+'* OR tag:'+w+'*)').join(' AND ');
const Q = `query($q:String!,$n:Int!){ products(first:$n, query:$q){ edges{ node{ title handle } } } }`;
const out=[];
for (const {q,d} of terms) {
  const r = await fetch(window.__cap.url, {method:'POST',
    headers:{'Content-Type':'application/json','X-Shopify-Storefront-Access-Token':window.__cap.token},
    body: JSON.stringify({query:Q, variables:{q:build(q), n:8}})});
  const j = await r.json();
  const items = ((j.data&&j.data.products&&j.data.products.edges)||[]).map(e=>({i:e.node.handle,t:e.node.title}));
  out.push({retailer:'<store>', dataset:d, q, total:items.length, n:items.length, items});
  await new Promise(s=>setTimeout(s,280)); // pace: no server load
}
window.__caps = out; // then extract in ~800-char slices (the tool truncates long returns)
```
4. Verify totals against the live dropdown (type a few terms, compare "N results" / "No results"). Then grade with `cortex-submit.mjs` / `cortex-poll.mjs`.

## Gotchas
- The Claude-in-Chrome extension can drop mid-loop; the in-page loop usually still completes — re-read `window.__caps`.
- Long JS returns are truncated (~850 chars); extract via `window.__c = out.map(...).join('\n')` then `slice(0,800)` chunks.
- Predictive `first:8` is what shoppers see (there may be no full search-results page — the default `/search` route can 404). Coverage = does the dropdown return anything.
- `$`/special chars in probe terms may break Shopify query syntax — wrap in try/catch → 0.
