import { readFileSync, writeFileSync } from 'node:fs';
// Submit partscat captures to the local Cortex judge, poll, write grades rows. gold_validation added after.
const BASE = 'http://127.0.0.1:7077';
const caps = JSON.parse(readFileSync('captures.json', 'utf8')).rows.filter((c) => Array.isArray(c.items) && c.items.length);
const queries = caps.map((c) => ({ query_id: 'partscat|' + c.q, query: c.q, products: c.items.map((t, i) => ({ id: 'partscat|' + c.q + '#' + (i + 1), title: t })) }));
const sub = await fetch(`${BASE}/v1/relevance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'ecommmerce-eval', min_context_window: 8192, k: 10, queries }) }).then((r) => r.json());
const jid = sub.job_id;
console.log('submitted', queries.length, 'queries, job', jid);
let res;
for (let i = 0; i < 400; i++) { res = await fetch(`${BASE}/v1/relevance/${jid}`).then((r) => r.json()); if (res.status === 'complete') break; await new Promise((r) => setTimeout(r, 3000)); }
if (res.status !== 'complete') { console.log('NOT COMPLETE:', res.status); process.exit(1); }
const rows = (res.queries || []).map((q) => {
  const grades = (q.judgments || []).map((j) => j.grade);
  const mean = grades.length ? +(grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2) : null;
  return { query_id: q.query_id, q: q.query_id.split('|')[1], ndcg: q.metrics?.ndcg ?? null, grades, mean_grade: mean, job_id: jid };
});
writeFileSync('grades-partial.json', JSON.stringify({ rubric_hash: res.rubric_hash, judge: { model: 'llama3.2:3b', temperature: 0, endpoint: BASE }, rows }, null, 1));
console.log('rubric', res.rubric_hash, '| graded', rows.length);
rows.forEach((r) => console.log('  ', r.q, 'ndcg=' + (r.ndcg == null ? '-' : r.ndcg.toFixed(2)), 'grades=[' + r.grades.join(',') + ']'));
