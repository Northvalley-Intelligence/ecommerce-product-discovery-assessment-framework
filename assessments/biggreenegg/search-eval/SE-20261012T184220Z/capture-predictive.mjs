// Per-store glue (H03, owner-authorized one-off paced capture 2026-10-12): biggreenegg.com predictive search.
// Pass 2 (retry of terms whose pass-1 response was a 302 canonicalisation redirect to the same endpoint; URL now sent in canonical form).
// Paced: >=1.2s/request, chunks of 15, 60s cooldown. Stops on any 429/403/challenge/non-200; never evades.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const UA = 'Northvalley-Ecommerce-Inspection/0.1';
const pack = JSON.parse(readFileSync(dir + 'query-pack.json', 'utf8'));
const LOG = dir + 'request-log.jsonl';
const OUT = dir + 'raw/capture-rows.json';
const MIN = 1250, CHUNK = 15, COOL = 61000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { rows: [], chunks: [], blocked: null };
const done = new Set(state.rows.map((r) => r.q));
const terms = pack.terms.filter((t) => !done.has(t.term));
let last = 0;
for (let c = 0; c * CHUNK < terms.length; c++) {
  const chunk = terms.slice(c * CHUNK, (c + 1) * CHUNK);
  const chunk_id = 'R' + String(state.chunks.length + 1).padStart(2, '0');
  const rec = { chunk_id, terms: chunk.map((t) => t.term), captured_at: new Date().toISOString() };
  for (const t of chunk) {
    const wait = MIN - (Date.now() - last); if (wait > 0) await sleep(wait);
    const url = `https://biggreenegg.com/search/suggest?q=${encodeURIComponent(t.term).replace(/%20/g, '+')}&resources%5Btype%5D=product&section_id=predictive-search`;
    last = Date.now();
    let status = 0, html = '', hdr = {};
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual' });
      status = r.status; hdr = { cfm: r.headers.get('cf-mitigated'), loc: r.headers.get('location') };
      html = await r.text();
    } catch (e) { status = -1; html = String(e); }
    appendFileSync(LOG, JSON.stringify({ t: new Date(last).toISOString(), term: t.term, chunk_id, status }) + '\n');
    const challenge = hdr.cfm || /Just a moment|cf-chl|challenge-platform|Attention Required/i.test(html.slice(0, 5000));
    if (status === 429 || status === 403 || status === -1 || challenge || status >= 500) {
      rec.blocked = true; state.chunks.push(rec); state.blocked = { at: new Date().toISOString(), term: t.term, status, challenge: !!challenge };
      writeFileSync(OUT, JSON.stringify(state)); console.log('BLOCK', state.blocked); process.exit(3);
    }
    if (status >= 300 && status < 400) {
      state.rows.push({ q: t.term, dataset: t.dataset, total: 0, zero: false, items: [], redirected: true, redirect_target: hdr.loc || '', organic_grid_found: false, chunk_id });
      continue;
    }
    const items = [], skus = [];
    for (const m of html.matchAll(/<a\s+href="\/products\/([^?"]+)[^"]*"\s+class="product-link"\s+aria-label="([^"]*)"/g)) { skus.push(m[1]); items.push(unesc(m[2])); }
    const gridFound = /predictive-search__products__list/.test(html);
    const msg = /No results|no results|couldn't find|did not match/i.test(html);
    state.rows.push({ q: t.term, dataset: t.dataset, total: items.length, zero: items.length === 0, items, item_skus: skus, organic_grid_found: gridFound, ...(items.length === 0 ? { no_results_msg: msg } : {}), chunk_id, source_url: url });
  }
  state.chunks.push(rec);
  writeFileSync(OUT, JSON.stringify(state));
  console.log(chunk_id, 'done', state.rows.length, '/', pack.terms.length, new Date().toISOString());
  if ((c + 1) * CHUNK < terms.length) await sleep(COOL);
}
console.log('FINISHED', state.rows.length);
