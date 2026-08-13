import { readFileSync, writeFileSync } from 'node:fs';
/*
 * Capture Cat Footwear (Salesforce Commerce Cloud / SFRA) search results, server-side, no browser.
 * Product names live in the image alt text ("<Name>, <Color>, dynamic"); the .product-name divs are
 * JS-filled and Einstein recommendations are JS-only, so a plain server fetch returns ORGANIC results only.
 *
 * Usage: node scripts/capture-catfootwear.mjs <terms.json [[q,dataset],...]> <out.json>
 */
const termsPath = process.argv[2];
const outPath = process.argv[3];
if (!termsPath || !outPath) { console.error('usage: capture-catfootwear.mjs <terms.json> <out.json>'); process.exit(1); }
const terms = JSON.parse(readFileSync(termsPath, 'utf8'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://www.catfootwear.com';

function parseNames(html) {
  const alts = [...html.matchAll(/alt="([^"]*?,\s*[^",]+,\s*(?:dynamic|static))"/gi)].map((m) => m[1]);
  const names = alts.map((a) => a.replace(/,\s*[^,]*,\s*(dynamic|static)\s*$/i, '').trim().replace(/&#39;/g, "'").replace(/&amp;/g, '&'))
    .filter((n) => n.length > 4 && /boot|shoe|sneaker|sandal|clog|slip|oxford|loafer|moc|chukka|wellington|slide/i.test(n));
  const seen = new Set(); const out = [];
  for (const n of names) { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(n); } }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const caps = [];
for (const [q, dataset] of terms) {
  const url = BASE + '/US/en/search?q=' + encodeURIComponent(q);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
    const html = await r.text();
    const finalPath = r.url.replace(/^https?:\/\/[^/]+/, '');
    const redirected = !r.url.includes('/search');
    // Known-item redirect: search lands directly on a product detail page (PDP, URL ends in .html).
    const isPdp = /\.html(\?|$)/i.test(finalPath) && !finalPath.includes('/search');
    if (isPdp) {
      const og = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || [])[1];
      const h1 = (html.match(/<h1[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]+)</i) || [])[1];
      const ttl = (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
      let name = (og || h1 || ttl || '').replace(/\s*\|\s*CAT Footwear.*$/i, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
      caps.push({ q, dataset, total: name ? 1 : 0, redirected: true, known_item: true, zero: !name, items: name ? [name] : [] });
      process.stdout.write(`${q}: known-item PDP -> ${name}\n`);
      await sleep(700); continue;
    }
    const noRes = /no products were found|did not match|no results/i.test(html);
    const items = parseNames(html);
    caps.push({ q, dataset, total: items.length, redirected, zero: items.length === 0, no_results_msg: noRes, items: items.slice(0, 8) });
    process.stdout.write(`${q}: ${items.length}${redirected ? 'R' : ''}${items.length === 0 ? ' ZERO' : ''}\n`);
  } catch (e) {
    caps.push({ q, dataset, error: String(e.message) });
    process.stdout.write(`${q}: ERR ${e.message}\n`);
  }
  await sleep(700);
}
writeFileSync(outPath, JSON.stringify(caps, null, 1));
console.log('\nwrote', caps.length, 'terms to', outPath);
