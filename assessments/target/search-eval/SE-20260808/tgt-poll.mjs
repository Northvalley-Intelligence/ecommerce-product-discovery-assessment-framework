import { readFileSync, writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:7077';
const jid=process.argv[2];
let res;
for(let i=0;i<120;i++){res=await fetch(`${BASE}/v1/relevance/${jid}`).then(r=>r.json());if(res.status==='complete')break;await new Promise(r=>setTimeout(r,3000));}
if(res.status!=='complete'){console.log('not complete:',res.status);process.exit(0);}
const rows=(res.queries||[]).map(q=>({query_id:q.query_id,q:q.query_id.split('|')[1],ndcg:q.metrics?.ndcg,grades:(q.judgments||[]).map(j=>j.grade)}));
writeFileSync(process.argv[3],JSON.stringify({rubric_hash:res.rubric_hash,rows},null,1));
console.log('rubric',res.rubric_hash,'| graded',rows.length);
