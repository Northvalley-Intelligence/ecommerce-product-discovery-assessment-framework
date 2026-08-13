// Usage: node gen-report.mjs [report-data.json] [out.tex]
// Then compile from a dir containing northvalley-template-assets/ (brand.sty + logo):
//   pdflatex -interaction=nonstopmode <out.tex>  (run twice)
// report-data.json fields: totals{IW,SB{search_calls,answered,mean_ndcg,mean_grade,pct_not_relevant,verdict}},
//   datasets[{name,terms,iw{answered,zero,mean_ndcg},sb{...},takeaway}], bugs[], gaps[], strengths[],
//   allTerms[{q,vol,raw,iw,sb,iw_ndcg,sb_ndcg,dataset,carried,ambiguous}], catalog.
// ADAPT PER STORE: this is a working template built for Industry West vs Seven Bonde. Update the
// store-specific placeholders before reuse -- \ReportClient, \ReportTitle, \ReportSummary, the running
// header text ("INDUSTRY WEST ... SEARCH RELEVANCE"), and the "Industry West"/"Seven Bonde" names and
// the IW/SB column labels used in the prose and tables below.
import { readFileSync, writeFileSync } from 'node:fs';
const IN = process.argv[2] || '/tmp/report-data.json';
const OUT = process.argv[3] || '/tmp/industrywest-search-report.tex';
const d = JSON.parse(readFileSync(IN, 'utf8'));
const E = (s) => String(s).replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
const tIW = d.totals.IW, tSB = d.totals.SB;
const covpct = (t) => Math.round(100 * t.answered / t.search_calls);
const nf = (x) => Number(x).toFixed(2);
const topBugs = d.bugs.filter((b) => !b.ambiguous).slice(0, 8);
const row4 = (b) => E(b.q) + ' & ' + E(b.raw) + ' & ' + b.iw + ' & ' + b.sb + ' \\\\';
const allBugs = d.bugs.map((b) => E(b.q) + (b.ambiguous ? '$^{\\dagger}$' : '') + ' & ' + E(b.raw) + ' & ' + b.iw + ' & ' + b.sb + ' \\\\').join('\n');
const gapRows = d.gaps.slice(0, 10).map((g) => E(g.q) + ' & ' + E(g.raw) + ' \\\\').join('\n');
const strengthList = d.strengths.map((s) => E(s.q)).join(', ');
const covn = (p) => p.answered + '/' + (p.answered + p.zero) + ' \\footnotesize(' + (p.mean_ndcg != null ? nf(p.mean_ndcg) : '0.00') + ')';
const dsRows = d.datasets.map((x) => E(x.name) + ' & ' + covn(x.iw) + ' & ' + covn(x.sb) + ' & ' + E(x.takeaway.split('.')[0]) + ' \\\\').join('\\addlinespace\n');
const dsOrder = ['synonym', 'attribute', 'job_function', 'head'];
const dsName = { synonym: 'Synonym / category', attribute: 'Attribute (material + type)', job_function: 'Job-function / intent', head: 'Head terms' };
let appendix = '';
for (const ds of dsOrder) {
  const rows = d.allTerms.filter((t) => t.dataset === ds).sort((a, z) => z.vol - a.vol);
  if (!rows.length) continue;
  appendix += '\\multicolumn{6}{@{}l}{\\rule{0pt}{2.6ex}\\bfseries\\color{NVIAccentDark}' + E(dsName[ds]) + '}\\\\\n';
  appendix += rows.map((t) => E(t.q) + ' & ' + E(t.raw) + ' & ' + t.iw + ' & ' + nf(t.iw_ndcg) + ' & ' + t.sb + ' & ' + nf(t.sb_ndcg) + ' \\\\').join('\n') + '\n\\addlinespace\n';
}
const COLS4 = '@{}p{\\dimexpr\\linewidth-2.05in\\relax}>{\\raggedleft\\arraybackslash}p{1.15in}>{\\centering\\arraybackslash}p{0.35in}>{\\centering\\arraybackslash}p{0.35in}@{}';
const COLS6 = '@{}p{\\dimexpr\\linewidth-3.5in\\relax}>{\\raggedleft\\arraybackslash}p{0.9in}>{\\centering\\arraybackslash}p{0.35in}>{\\centering\\arraybackslash}p{0.55in}>{\\centering\\arraybackslash}p{0.35in}>{\\centering\\arraybackslash}p{0.55in}@{}';
const P = [];
P.push('\\documentclass[10pt]{article}');
P.push('\\newcommand{\\NorthvalleyAssetPath}{northvalley-template-assets}');
P.push('\\input{northvalley-template-assets/northvalley-brand.sty}');
P.push('\\usepackage[letterpaper,margin=0.7in,headheight=16pt,headsep=14pt,footskip=26pt]{geometry}');
P.push('\\usepackage{booktabs}\\usepackage{longtable}\\usepackage{fancyhdr}\\usepackage[hidelinks]{hyperref}');
P.push('\\renewcommand{\\familydefault}{\\sfdefault}\\renewcommand{\\arraystretch}{1.18}\\arrayrulecolor{NVIRule}');
P.push('\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{3pt}\\color{NVIInk}');
P.push('\\renewcommand{\\labelitemi}{\\textcolor{NVIAccent}{\\(\\triangleright\\)}}');
P.push('\\newcommand{\\qq}[1]{\\textquotedblleft #1\\textquotedblright}');
// Report macros
P.push('\\newcommand{\\ReportKicker}[1]{{\\fontsize{7.7}{9}\\selectfont\\bfseries\\color{NVIAccent}\\MakeUppercase{#1}}}');
P.push('\\newcommand{\\ReportBody}[1]{{\\fontsize{9.6}{12}\\selectfont\\color{NVIInk}#1}}');
P.push('\\newcommand{\\ReportFine}[1]{{\\fontsize{7.8}{9.3}\\selectfont\\color{NVIMuted}#1}}');
P.push('\\newcommand{\\ReportSection}[1]{\\par\\addvspace{9pt}{\\fontsize{14}{17}\\selectfont\\bfseries\\color{NVIInk}#1}\\par\\vspace{1pt}{\\color{NVIAccent}\\rule{\\linewidth}{0.9pt}}\\par\\addvspace{3pt}}');
P.push('\\newcommand{\\ReportCard}[2]{\\begin{tikzpicture}\\node[draw=NVIRule,fill=white,rounded corners=2pt,inner xsep=11pt,inner ysep=9pt,text width=\\dimexpr\\linewidth-24pt\\relax,align=left]{\\ReportKicker{#1}\\\\[0.05in]\\ReportBody{#2}};\\end{tikzpicture}}');
P.push('\\newcommand{\\ReportDarkCard}[2]{\\begin{tikzpicture}\\node[draw=NVIAccentDark,fill=NVIAccentDark,rounded corners=2pt,inner xsep=12pt,inner ysep=10pt,text width=\\dimexpr\\linewidth-26pt\\relax,align=left]{{\\fontsize{7.7}{9}\\selectfont\\bfseries\\color{NVIAccentSoft}\\MakeUppercase{#1}}\\\\[0.06in]{\\fontsize{10.2}{12.4}\\selectfont\\color{white}#2}};\\end{tikzpicture}}');
P.push('\\newcommand{\\MetricCard}[3]{\\begin{tikzpicture}\\node[draw=NVIRule,fill=NVIPanel,rounded corners=2pt,inner xsep=9pt,inner ysep=8pt,text width=\\dimexpr\\linewidth-20pt\\relax,minimum height=0.8in,align=left]{\\ReportKicker{#1}\\\\[0.04in]{\\fontsize{18}{21}\\selectfont\\bfseries\\color{NVIAccentDark}#2}\\\\[0.02in]\\ReportFine{#3}};\\end{tikzpicture}}');
// running header/footer
P.push('\\fancypagestyle{nvi}{\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}\\fancyhead[L]{\\footnotesize\\color{NVIAccent}\\bfseries INDUSTRY WEST \\textperiodcentered\\ SEARCH RELEVANCE}\\fancyhead[R]{\\footnotesize\\color{NVIMuted}Complimentary read}\\fancyfoot[L]{\\footnotesize\\color{NVIMuted}\\NorthvalleyBusinessName}\\fancyfoot[R]{\\footnotesize\\color{NVIMuted}\\thepage}}');
P.push('\\newcommand{\\ReportTitle}{On-site search relevance}');
P.push('\\newcommand{\\ReportClient}{Industry West}');
P.push('\\newcommand{\\ReportSummary}{A complimentary, evidence-first read on Industry West\\textquotesingle s storefront search --- and the new Seven Bonde store it is migrating to --- with the highest-demand searches to fix, ranked by real Google demand.}');
P.push('\\begin{document}\\color{NVIInk}');
// ---------- COVER ----------
P.push('\\thispagestyle{empty}');
P.push('\\begin{tikzpicture}[remember picture,overlay]');
P.push('\\fill[NVIPanel] (current page.north west) rectangle (current page.south east);');
P.push('\\fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-1.05in]current page.north east);');
P.push('\\fill[NVIAccent] ([yshift=-1.05in]current page.north west) rectangle ([yshift=-1.10in]current page.north east);');
P.push('\\fill[NVIAccentSoft] ([xshift=-1.60in,yshift=-1.10in]current page.north east) -- (current page.north east) -- ([yshift=-2.45in]current page.north east) -- cycle;');
P.push('\\fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.45in]current page.south east);');
P.push('\\node[anchor=west,text=white,font=\\fontsize{9.3}{11}\\selectfont\\bfseries] at ([xshift=0.7in,yshift=-0.52in]current page.north west) {\\NorthvalleyBusinessName};');
P.push('\\node[anchor=east,text=white,font=\\fontsize{7.6}{9}\\selectfont] at ([xshift=-0.7in,yshift=-0.52in]current page.north east) {\\today};');
P.push('\\node[anchor=west,text=white,font=\\fontsize{7.2}{8.4}\\selectfont] at ([xshift=0.7in,yshift=0.22in]current page.south west) {\\NorthvalleyContactLine};');
P.push('\\end{tikzpicture}');
P.push('\\vspace*{1.15in}\\begin{minipage}[t]{0.58\\linewidth}\\raggedright');
P.push('\\ReportKicker{Complimentary Findings Report}\\\\[0.12in]');
P.push('{\\fontsize{30}{35}\\selectfont\\bfseries\\color{NVIInk}\\ReportTitle}\\par');
P.push('\\vspace{0.18in}{\\fontsize{12}{15}\\selectfont\\color{NVIInk}\\ReportSummary}\\par');
P.push('\\vspace{0.26in}{\\color{NVIAccent}\\rule{2.6in}{0.9pt}}\\par');
P.push('\\vspace{0.16in}{\\fontsize{9.2}{11}\\selectfont\\color{NVIMuted}Prepared for}\\\\[-0.01in]{\\fontsize{15}{18}\\selectfont\\bfseries\\color{NVIAccentDark}\\ReportClient}\\par');
P.push('\\vspace{0.06in}{\\fontsize{9}{10.8}\\selectfont\\color{NVIMuted}Prepared by \\NorthvalleyBusinessName}\\par');
P.push('\\vspace{0.14in}{\\fontsize{7.6}{9.6}\\selectfont\\itshape\\color{NVIMuted}A quick, browser-based research read --- not a formal audit. No crawling and no load on production. Demand figures are Google Keyword Planner national (US) averages (interest, not addressable revenue).}');
P.push('\\end{minipage}\\hfill\\begin{minipage}[t]{0.31\\linewidth}\\centering\\vspace{0.06in}');
P.push('\\NorthvalleyLogo[0.9in]\\par\\vspace{0.22in}');
P.push('\\ReportDarkCard{The verdict}{Two engines, opposite flaws: the legacy storefront is broad but fuzzy; the new store is precise but narrow. Both miss attributes and intent.}');
P.push('\\vspace{0.1in}\\MetricCard{Fixable now}{' + d.bugs.length + '}{high-demand searches the catalog can satisfy but search misses.}');
P.push('\\end{minipage}\\newpage');
// ---------- PAGE 1: SUMMARY / METHOD / HELP ----------
P.push('\\pagestyle{nvi}');
P.push('\\ReportSection{Summary}');
P.push('\\begin{minipage}[t]{0.62\\linewidth}');
P.push('\\ReportDarkCard{The headline}{The two stores fail in opposite ways. The legacy Industry West storefront casts a wide but fuzzy net; the new Seven Bonde store is precise but narrow. Both miss material-plus-type searches (walnut dining table) and natural-language intent (furnish a living room), and the new store returns nothing for high-demand terms the catalog carries.}');
P.push('\\vspace{0.1in}\\ReportBody{The single biggest signal: high-demand searches the catalog can satisfy but the engine misses --- e.g. \\textbf{coffee table} (246{,}000/mo) and \\textbf{accent chair} (110{,}000/mo) return solid results on the legacy storefront but \\textbf{zero} on the new Seven Bonde store. Throughout, \\textbf{IW} = Industry West, \\textbf{SB} = Seven Bonde.}');
P.push('\\end{minipage}\\hfill\\begin{minipage}[t]{0.34\\linewidth}');
P.push('\\MetricCard{Industry West}{' + covpct(tIW) + '\\%}{answered \\textperiodcentered\\ ' + tIW.pct_not_relevant + '\\% off-target --- broad but fuzzy}');
P.push('\\vspace{0.09in}\\MetricCard{Seven Bonde (new)}{' + covpct(tSB) + '\\%}{answered \\textperiodcentered\\ ' + tSB.pct_not_relevant + '\\% off-target --- precise but narrow}');
P.push('\\end{minipage}');
P.push('\\ReportSection{How this was measured}');
P.push('\\begin{itemize}\\setlength{\\itemsep}{1pt}\\setlength{\\parskip}{0pt}\\setlength{\\topsep}{2pt}');
P.push('\\item \\textbf{Real shopper search, no production load.} Each store was evaluated on its live on-site search --- the engine shoppers actually use --- with bounded, paced reads (about one per second, a plain inspection user-agent, robots respected). \\textbf{No crawling, no scraping, and no load on production.}');
P.push('\\item \\textbf{Graded relevance.} Every returned product was scored 0--3 for relevance by a local large language model (Meta Llama 3.2 3B, temperature 0, reproducible), summarized as NDCG (0--1).');
P.push('\\item \\textbf{Demand overlay.} Each term is joined to Google Keyword Planner monthly search volume, so failures are ranked by real demand.');
P.push('\\item \\textbf{Scope.} ' + d.allTerms.length + ' shopper search terms across four query datasets. A quick read, not an exhaustive audit; reliability rises with search-API access and real query logs.');
P.push('\\end{itemize}');
P.push('\\ReportSection{How we can help}');
P.push('\\ReportDarkCard{Complimentary now --- deeper on request}{This is a complimentary read on a bounded set of queries. We can run the same evidence-first analysis \\textbf{at scale} against your full on-site query logs and catalog --- as a \\textbf{one-time} deep audit, or on a \\textbf{recurring schedule} that keeps tabs on search relevancy as your catalog and platform evolve (especially valuable while traffic shifts to the new Seven Bonde store). The deliverable is the same: a reproducible, demand-ranked list of the exact searches to fix.}');
P.push('\\newpage');
// ---------- DETAILS ----------
P.push('\\ReportSection{What works well}');
P.push('\\ReportBody{Core product-type and material searches are strong on \\textbf{both} stores --- clean, relevant results (relevance about 0.94): ' + strengthList + '. The engines handle the basics; the gaps are synonyms, attributes, and intent.}\\par');
P.push('\\ReportSection{Where the money is: high-demand searches that return nothing}');
P.push('Terms with real Google demand where the store search comes back empty or near-empty. \\textbf{IW} / \\textbf{SB} show how many products each store returns today.');
P.push('\\vspace{2pt}{\\rowcolors{2}{NVIPanel}{white}\\begin{longtable}{' + COLS4 + '}\\toprule\\bfseries Search term & \\bfseries Monthly Google searches & \\bfseries IW & \\bfseries SB \\\\\\midrule\\endhead');
P.push(topBugs.map(row4).join('\n'));
P.push('\\bottomrule\\end{longtable}}');
P.push('\\ReportSection{The problems, by category}');
P.push('IW / SB show queries answered out of total, with the average NDCG of the returned results in parentheses (0.00 = nothing returned).');
P.push('\\vspace{2pt}\\begin{longtable}{@{}p{1.7in}>{\\centering\\arraybackslash}p{1.05in}>{\\centering\\arraybackslash}p{1.05in}>{\\raggedright\\arraybackslash}p{\\dimexpr\\linewidth-3.9in\\relax}@{}}\\toprule\\bfseries Dataset & \\bfseries IW & \\bfseries SB & \\bfseries Takeaway \\\\\\midrule\\endhead');
P.push(dsRows);
P.push('\\bottomrule\\end{longtable}');
P.push('\\begin{itemize}\\setlength{\\itemsep}{1pt}\\setlength{\\parskip}{0pt}\\setlength{\\topsep}{2pt}');
P.push('\\item \\textbf{Attributes are broken on both.} \\qq{walnut dining table}, \\qq{oak dining table}, \\qq{marble coffee table}, \\qq{velvet chair}, \\qq{cane dining chair} all return \\textbf{0} on both stores, despite the catalog stocking marble, oak, walnut, leather and cane.');
P.push('\\item \\textbf{Natural-language intent is dead on both.} \\qq{furnish a living room}, \\qq{dining set for 6}, \\qq{home office}, \\qq{small space seating}, \\qq{reading chair} all return \\textbf{0}. Shoppers who describe what they want, rather than name a product, hit a wall.');
P.push('\\item \\textbf{The migration swapped one flaw for another.} The legacy storefront is fuzzy (' + tIW.pct_not_relevant + '\\% off-target); the new store is so strict it returns nothing for common words like \\qq{kitchen stool}, \\qq{accent chair} and \\qq{coffee table}.');
P.push('\\end{itemize}');
P.push('\\ReportSection{Complimentary quick-win list: fixable search bugs, ranked by demand}');
P.push('Searches the catalog can satisfy but the engine misses --- the highest-leverage fixes, workable with us or your current search vendor.');
P.push('\\vspace{2pt}{\\rowcolors{2}{NVIPanel}{white}\\begin{longtable}{' + COLS4 + '}\\toprule\\bfseries Search term & \\bfseries Monthly searches & \\bfseries IW & \\bfseries SB \\\\\\midrule\\endhead');
P.push(allBugs);
P.push('\\bottomrule\\end{longtable}}');
P.push('{\\ReportFine{$^{\\dagger}$ Broad/ambiguous term --- national volume is dominated by a non-furniture meaning (e.g. \\qq{buffet} = food); treat as indicative only.}}\\par');
P.push('\\ReportSection{Separate opportunity: assortment gaps (not a search problem)}');
P.push('High-demand searches that return nothing because the item is \\textbf{not stocked} --- a merchandising / expansion signal, not a search fix.');
P.push('\\vspace{2pt}{\\rowcolors{2}{NVIPanel}{white}\\begin{longtable}{@{}p{\\dimexpr\\linewidth-1.6in\\relax}>{\\raggedleft\\arraybackslash}p{1.5in}@{}}\\toprule\\bfseries Search term & \\bfseries Monthly searches \\\\\\midrule\\endhead');
P.push(gapRows);
P.push('\\bottomrule\\end{longtable}}');
P.push('\\ReportSection{Appendix: all search terms tried}');
P.push('Monthly = Google Keyword Planner avg. monthly searches. \\# = products returned by each store search; NDCG = average relevance of those results, 0--1 (0.00 = nothing returned).');
P.push('\\vspace{2pt}\\begin{longtable}{' + COLS6 + '}\\toprule & & \\multicolumn{2}{c}{\\bfseries Industry West} & \\multicolumn{2}{c}{\\bfseries Seven Bonde} \\\\ \\bfseries Search term & \\bfseries Monthly & \\# & \\bfseries NDCG & \\# & \\bfseries NDCG \\\\\\midrule\\endhead');
P.push(appendix + '\\bottomrule\\end{longtable}');
P.push('\\end{document}');
writeFileSync(OUT, P.join('\n\n'));
console.log('wrote branded tex');
