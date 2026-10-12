// H03 stage 6 verification: one plain GET of the live results page per selected term (owner-authorized one-off, paced >=1.25s).
import { writeFileSync, appendFileSync } from 'node:fs';
const terms = ['apron'];
const unesc = (s) => s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&ndash;/g,'-').trim();
const out = [];
for (const q of terms) {
  const url = `https://biggreenegg.com/search?q=${encodeURIComponent(q).replace(/%20/g,'+')}&type=product`;
  const t = new Date().toISOString();
  const r = await fetch(url, { headers: { 'User-Agent': 'Northvalley-Ecommerce-Inspection/0.1' }, redirect: 'follow' });
  const html = await r.text();
  appendFileSync('request-log.jsonl', JSON.stringify({ t, term: q, chunk_id: 'verify-results-page', status: r.status }) + '\n');
  if (r.status !== 200 || /cf-chl|Just a moment/.test(html.slice(0,4000))) { console.log('BLOCK', q, r.status); out.push({ q, status: r.status, blocked: true }); break; }
  const titles = [...html.matchAll(/class="product-item__title">(.*?)<\/p>/gs)].map((m) => unesc(m[1]));
  const m = html.match(/Search:\s*(\d+) results? found/); const none = /No results found|no results|couldn.t find/i.test(html);
  out.push({ q, url, status: r.status, checked_at: t, total_text: m ? +m[1] : null, none_msg: none, shown: titles.length, top3: titles.slice(0,3) });
  console.log(q, '|', m ? m[1] : null, none, titles.slice(0,3));
  await new Promise((s) => setTimeout(s, 1300));
}
writeFileSync('raw/verify-live-2.json', JSON.stringify(out, null, 1));
