import { readFileSync, writeFileSync, existsSync } from 'node:fs';
// Rebuild target-eval-board.json from a canonical rows file (target-all-rows.json).
// Usage: node build-expanded-board.mjs           -> just recompute board from all-rows
//        node build-expanded-board.mjs add <capture.json(arr)> <ndcg.json>  -> append graded batch then recompute
const DIR='.';
const termsMap=Object.fromEntries(JSON.parse(readFileSync('target-terms.json','utf8')).map(([q,d])=>[q.toLowerCase(),d]));
const DS=[['synonym','Synonym / category'],['attribute','Attribute (type+material)'],['job_function','Job-function (task)'],['intent','Intent (natural language)'],['literal','Literal (brand/product)']];
const dsName=Object.fromEntries(DS);

function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}

// seed canonical rows from the existing board once
let all;
if(existsSync('target-all-rows.json')){all=JSON.parse(readFileSync('target-all-rows.json','utf8'));}
else{all=JSON.parse(readFileSync('target-eval-board.json','utf8')).rows;}

if(process.argv[2]==='add'){
  const caps=JSON.parse(readFileSync(process.argv[3],'utf8'));           // [{q,total,items}]
  const capByQ=Object.fromEntries(caps.map(c=>[c.q.toLowerCase(),c]));
  const ndcg=JSON.parse(readFileSync(process.argv[4],'utf8'));           // {rubric_hash,rows:[{q,ndcg,grades}]}
  const have=new Set(all.map(r=>r.q.toLowerCase()));
  let added=0;
  for(const nr of ndcg.rows){
    const q=nr.q; const ql=q.toLowerCase();
    if(have.has(ql))continue;
    const cap=capByQ[ql]; if(!cap)continue;
    const grades=nr.grades||[];
    all.push({
      dataset: termsMap[ql]||'intent',
      q,
      total: String(cap.total),
      search_call:'https://www.target.com/s?searchTerm='+encodeURIComponent(q),
      items: cap.items,
      grades_pinned: grades,
      ndcg_pinned: nr.ndcg,
      mean_grade: grades.length? +mean(grades).toFixed(2): null
    });
    have.add(ql); added++;
  }
  writeFileSync('target-all-rows.json',JSON.stringify(all,null,1));
  console.log('added',added,'rows -> total',all.length);
}

// recompute datasets + overall from `all`
const board=JSON.parse(readFileSync('target-eval-board.json','utf8'));
const datasets=DS.map(([id,name])=>{
  const rs=all.filter(r=>r.dataset===id);
  const grades=[].concat(...rs.map(r=>r.grades_pinned||[]));
  const ndcgs=rs.map(r=>r.ndcg_pinned).filter(v=>v!=null);
  const shallow=rs.filter(r=>r.mean_grade!=null&&r.mean_grade<1.5).length;
  return {id,name,terms:rs.length,
    mean_ndcg: ndcgs.length? +mean(ndcgs).toFixed(2): null,
    mean_grade: grades.length? +mean(grades).toFixed(2): null,
    pct_not_relevant: grades.length? Math.round(grades.filter(g=>g<=1).length/grades.length*100): null,
    shallow};
}).filter(d=>d.terms>0);
const allg=[].concat(...all.map(r=>r.grades_pinned||[]));
board.datasets=datasets;
board.rows=all;
board.overall={terms:all.length, mean_grade:+mean(allg).toFixed(2), pct_not_relevant:Math.round(allg.filter(g=>g<=1).length/allg.length*100), product_judgments:allg.length};
writeFileSync('target-eval-board.json',JSON.stringify(board,null,1));
console.log('BOARD terms:',all.length,'| mean_grade:',board.overall.mean_grade,'| not-rel:',board.overall.pct_not_relevant+'%');
datasets.forEach(d=>console.log('  ',d.id,d.terms,'terms  grade',d.mean_grade,'  nr',d.pct_not_relevant+'%'));
