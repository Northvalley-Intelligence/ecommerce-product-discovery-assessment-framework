import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:7077';
const caps = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const queries = caps.map((c) => {
  const qid = `${c.retailer}|${c.q}`;
  if (!Array.isArray(c.items) || !c.items.length) return null;
  return { query_id: qid, query: c.q, products: c.items.map((it, i) => ({ id: `${qid}#${it.i || i + 1}`, title: it.t })) };
}).filter(Boolean);
const res = await fetch(`${BASE}/v1/relevance`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client: 'ecommmerce-eval', min_context_window: 8192, k: 10, queries }) }).then((r) => r.json());
console.log(JSON.stringify({ job_id: res.job_id, n_queries: queries.length }));
