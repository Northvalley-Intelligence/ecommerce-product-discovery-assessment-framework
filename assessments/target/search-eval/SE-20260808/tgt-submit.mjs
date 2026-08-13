import { readFileSync } from 'node:fs';
const BASE='http://127.0.0.1:7077';
const caps=JSON.parse(readFileSync(process.argv[2],'utf8')).filter(c=>Array.isArray(c.items)&&c.items.length);
const queries=caps.map(c=>({query_id:'target|'+c.q,query:c.q,products:c.items.map((t,i)=>({id:'target|'+c.q+'#'+(i+1),title:typeof t==='string'?t:t.t}))}));
const res=await fetch(`${BASE}/v1/relevance`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:'ecommmerce-eval',min_context_window:8192,k:10,queries})}).then(r=>r.json());
console.log(res.job_id);
