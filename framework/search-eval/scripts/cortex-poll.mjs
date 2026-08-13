import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:7077';
const rows=[]; let rubric=null, dflt=null;
for(const jid of process.argv.slice(2)){
  let res; for(let i=0;i<120;i++){res=await fetch(`${BASE}/v1/relevance/${jid}`).then(r=>r.json());if(res.status==='complete')break;await new Promise(r=>setTimeout(r,3000));}
  if(res.status!=='complete'){console.error('not complete',jid,res.status);continue;}
  rubric=res.rubric_hash||rubric; dflt=res.using_default_rubric;
  for(const q of (res.queries||[])) rows.push({query_id:q.query_id,ndcg:q.metrics?.ndcg,grades:(q.judgments||[]).map(j=>j.grade)});
}
const s=rows.filter(r=>typeof r.ndcg==='number');
console.log(`mean NDCG ${(s.reduce((a,b)=>a+b.ndcg,0)/s.length).toFixed(3)} (n=${s.length})  rubric=${String(rubric).slice(0,12)} default=${dflt}`);
writeFileSync(process.env.OUT,JSON.stringify({rubric_hash:rubric,using_default_rubric:dflt,rows},null,1));
