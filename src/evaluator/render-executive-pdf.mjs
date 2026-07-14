#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { exists, readJson, writeText } from '../lib/fs-json.mjs';

// Renders the application-generated executive report JSON into a
// Northvalley-branded LaTeX/PDF. Reads only the run directory; the PDF is a
// re-renderable artifact of retained evidence (decision 1A).

const ESCAPES = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  '$': '\\$',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}'
};

function esc(value) {
  return String(value ?? '').replace(/[\\&%$#_{}~^]/g, (char) => ESCAPES[char]);
}

export function latexmkAvailable() {
  return spawnSync('latexmk', ['--version'], { stdio: 'ignore' }).status === 0;
}

function scoreCell(entry) {
  return entry.status === 'observed' ? `${entry.score}/100` : 'Not observed';
}

function buildTex(executive, assetPath) {
  const target = executive.target || {};
  const context = executive.inspection_context || {};
  const scorecard = executive.scorecard || [];
  const strengths = (executive.findings || []).filter((finding) => finding.type === 'strength');
  const issues = (executive.findings || []).filter((finding) => finding.type === 'issue');
  const gaps = (executive.findings || []).filter((finding) => finding.type === 'coverage_gap');
  const opportunities = executive.opportunities || [];
  const limitations = executive.limitations || [];
  const observed = scorecard.filter((entry) => entry.status === 'observed');
  const inspectedDate = String(context.inspected_at || '').slice(0, 10);

  const summarySentences = [];
  if (context.platform_detection?.platform) {
    summarySentences.push(
      `${target.name} runs on ${context.platform_detection.platform} (detected at ${context.platform_detection.confidence} confidence).`
    );
  }
  summarySentences.push(
    `Across ${observed.length} observed discovery surfaces, ${strengths.length} strength${strengths.length === 1 ? '' : 's'} and ${issues.length} issue${issues.length === 1 ? '' : 's'} were identified from retained inspection evidence.`
  );
  if (gaps.length) {
    summarySentences.push(`${gaps.length} surface${gaps.length === 1 ? ' was' : 's were'} not observable and carry no claims in this report.`);
  }

  const findingBlocks = [...issues, ...strengths].slice(0, 6);

  const lines = [];
  lines.push('\\documentclass[10pt]{article}');
  lines.push(`\\newcommand{\\NorthvalleyAssetPath}{${assetPath}}`);
  lines.push(`\\input{${assetPath}/northvalley-brand.sty}`);
  lines.push('\\usepackage[letterpaper,margin=0.62in,top=0.62in,bottom=0.72in]{geometry}');
  lines.push('\\usepackage{booktabs}');
  lines.push('\\usepackage[hidelinks]{hyperref}');
  lines.push('\\renewcommand{\\familydefault}{\\sfdefault}');
  lines.push('\\pagestyle{empty}');
  lines.push('\\setlength{\\parindent}{0pt}');
  lines.push('\\setlength{\\parskip}{4pt}');
  lines.push('\\renewcommand{\\labelitemi}{\\textcolor{NVIAccent}{\\(\\triangleright\\)}}');
  lines.push('\\hyphenpenalty=10000');
  lines.push('\\exhyphenpenalty=10000');
  lines.push('\\emergencystretch=0.10in');
  lines.push(`\\newcommand{\\ReportTitle}{Product Discovery Executive Report}`);
  lines.push(`\\newcommand{\\ReportClient}{${esc(target.name)}}`);
  lines.push(`\\newcommand{\\ReportDate}{${esc(inspectedDate)}}`);
  lines.push('\\newcommand{\\ReportPreparedBy}{Northvalley Intelligence LLC}');
  lines.push(`\\newcommand{\\ReportPageHeader}[1]{%
  \\begin{tikzpicture}[remember picture,overlay]
    \\fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-0.46in]current page.north east);
    \\fill[NVIAccent] ([yshift=-0.46in]current page.north west) rectangle ([yshift=-0.49in]current page.north east);
    \\node[anchor=west,text=white,font=\\fontsize{8.4}{9.8}\\selectfont\\bfseries]
      at ([xshift=0.62in,yshift=-0.23in]current page.north west) {#1};
    \\node[anchor=east,text=white,font=\\fontsize{7.4}{8.6}\\selectfont]
      at ([xshift=-0.62in,yshift=-0.23in]current page.north east) {\\ReportClient};
  \\end{tikzpicture}
  \\vspace*{0.22in}
}`);
  lines.push(`\\newcommand{\\ReportFooter}{%
  \\begin{tikzpicture}[remember picture,overlay]
    \\fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.34in]current page.south east);
    \\node[anchor=west,text=white,font=\\fontsize{7.2}{8.4}\\selectfont]
      at ([xshift=0.62in,yshift=0.17in]current page.south west) {\\NorthvalleyContactLine};
    \\node[anchor=east,text=white,font=\\fontsize{7.2}{8.4}\\selectfont]
      at ([xshift=-0.62in,yshift=0.17in]current page.south east) {\\thepage};
  \\end{tikzpicture}
}`);
  lines.push(`\\newcommand{\\ReportSection}[1]{%
  \\vspace{0.12in}
  {\\fontsize{15}{18}\\selectfont\\bfseries\\color{NVIInk}#1}\\\\[-0.02in]
  {\\color{NVIAccent}\\rule{\\linewidth}{0.8pt}}
  \\vspace{0.07in}
}`);
  lines.push('\\newcommand{\\ReportKicker}[1]{{\\fontsize{7.7}{9}\\selectfont\\bfseries\\color{NVIAccent}\\MakeUppercase{#1}}}');
  lines.push('\\newcommand{\\ReportBody}[1]{{\\fontsize{9.4}{11.5}\\selectfont\\color{NVIInk}#1}}');
  lines.push('\\newcommand{\\ReportFine}[1]{{\\fontsize{7.6}{9.1}\\selectfont\\color{NVIMuted}#1}}');
  lines.push(`\\newcommand{\\ReportCard}[2]{%
  \\begin{tikzpicture}
    \\node[draw=NVIRule,fill=white,rounded corners=2pt,inner xsep=11pt,inner ysep=9pt,text width=\\dimexpr\\linewidth-24pt\\relax,align=left] {
      \\ReportKicker{#1}\\\\[0.05in]
      \\ReportBody{#2}
    };
  \\end{tikzpicture}
}`);
  lines.push(`\\newcommand{\\ReportDarkCard}[2]{%
  \\begin{tikzpicture}
    \\node[draw=NVIAccentDark,fill=NVIAccentDark,rounded corners=2pt,inner xsep=12pt,inner ysep=10pt,text width=\\dimexpr\\linewidth-26pt\\relax,align=left] {
      {\\fontsize{7.7}{9}\\selectfont\\bfseries\\color{NVIAccentSoft}\\MakeUppercase{#1}}\\\\[0.06in]
      {\\fontsize{10.4}{12.6}\\selectfont\\color{white}#2}
    };
  \\end{tikzpicture}
}`);
  lines.push(`\\newcommand{\\MetricCard}[3]{%
  \\begin{tikzpicture}
    \\node[draw=NVIRule,fill=NVIPanel,rounded corners=2pt,inner xsep=9pt,inner ysep=8pt,text width=\\dimexpr\\linewidth-20pt\\relax,minimum height=0.92in,align=left] {
      \\ReportKicker{#1}\\\\[0.04in]
      {\\fontsize{18}{21}\\selectfont\\bfseries\\color{NVIAccentDark}#2}\\\\[0.02in]
      \\ReportFine{#3}
    };
  \\end{tikzpicture}
}`);
  lines.push(`\\newcommand{\\FindingBlock}[3]{%
  \\ReportCard{#1}{%
    {\\bfseries #2}\\\\[0.03in]
    #3
  }
}`);
  lines.push('\\begin{document}');
  lines.push('\\color{NVIInk}');
  lines.push('\\hypersetup{pageanchor=false}');

  // Cover
  lines.push(`\\begin{titlepage}
\\thispagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[NVIPanel] (current page.north west) rectangle (current page.south east);
  \\fill[NVIAccentDark] (current page.north west) rectangle ([yshift=-1.05in]current page.north east);
  \\fill[NVIAccent] ([yshift=-1.05in]current page.north west) rectangle ([yshift=-1.10in]current page.north east);
  \\fill[NVIAccentSoft] ([xshift=-1.60in,yshift=-1.10in]current page.north east) -- (current page.north east) -- ([yshift=-2.45in]current page.north east) -- cycle;
  \\fill[NVIAccentDark] (current page.south west) rectangle ([yshift=0.45in]current page.south east);
  \\node[anchor=west,text=white,font=\\fontsize{9.3}{11}\\selectfont\\bfseries]
    at ([xshift=0.62in,yshift=-0.52in]current page.north west) {\\NorthvalleyBusinessName};
  \\node[anchor=east,text=white,font=\\fontsize{7.6}{9}\\selectfont]
    at ([xshift=-1.85in,yshift=-0.52in]current page.north east) {\\ReportDate};
  \\node[anchor=west,text=white,font=\\fontsize{7.2}{8.4}\\selectfont]
    at ([xshift=0.62in,yshift=0.22in]current page.south west) {\\NorthvalleyContactLine};
\\end{tikzpicture}
\\vspace*{1.08in}
\\begin{minipage}[t]{0.58\\linewidth}
\\raggedright
\\ReportKicker{Ecommerce Inspection Deliverable}\\\\[0.12in]
{\\fontsize{29}{34}\\selectfont\\bfseries\\color{NVIInk}\\ReportTitle}\\par
\\vspace{0.20in}
{\\fontsize{12}{14.6}\\selectfont\\color{NVIInk}${esc(summarySentences.join(' '))}}\\par
\\vspace{0.30in}
{\\color{NVIAccent}\\rule{2.6in}{0.9pt}}\\par
\\vspace{0.18in}
{\\fontsize{9.2}{11}\\selectfont\\color{NVIMuted}Prepared for}\\\\[-0.01in]
{\\fontsize{15}{18}\\selectfont\\bfseries\\color{NVIAccentDark}\\ReportClient}\\par
\\vspace{0.04in}
{\\fontsize{9}{10.8}\\selectfont\\color{NVIMuted}${esc(target.url || '')}}\\par
\\vspace{0.08in}
{\\fontsize{9}{10.8}\\selectfont\\color{NVIMuted}Prepared by \\ReportPreparedBy}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.31\\linewidth}
\\centering
\\vspace{0.10in}
\\NorthvalleyLogo[0.88in]\\par
\\vspace{0.24in}
\\ReportDarkCard{Evidence Basis}{Generated from inspection ${esc(executive.generated_from_inspection)} and its retained evidence. No new site inspection was performed.}
\\vspace{0.12in}
\\MetricCard{Evidence Coverage}{${esc(context.component_coverage_percent ?? '?')}\\%}{Observed discovery components in the source inspection.}
\\end{minipage}
\\end{titlepage}
\\hypersetup{pageanchor=true}
\\setcounter{page}{1}`);

  // Page 1: summary + scorecard
  lines.push('\\ReportPageHeader{Executive Summary}');
  lines.push('\\ReportFooter');
  lines.push('\\ReportSection{Executive Summary}');
  lines.push('\\begin{minipage}[t]{0.62\\linewidth}');
  lines.push(`\\ReportDarkCard{What We Found}{${esc(summarySentences.join(' '))}}`);
  lines.push('\\vspace{0.14in}');
  lines.push('\\ReportSection{Discovery Scorecard}');
  lines.push('\\begin{tabularx}{\\linewidth}{@{}L{0.30\\linewidth}L{0.16\\linewidth}N@{}}');
  lines.push('\\toprule');
  lines.push('\\textbf{Surface} & \\textbf{Score} & \\textbf{Basis}\\\\');
  lines.push('\\midrule');
  for (const entry of scorecard) {
    lines.push(`${esc(entry.surface)} & ${esc(scoreCell(entry))} & ${esc(entry.status === 'observed' ? `${entry.formula} (${entry.observations} observations, ${entry.confidence} confidence)` : entry.reason)}\\\\`);
  }
  lines.push('\\bottomrule');
  lines.push('\\end{tabularx}');
  lines.push('\\vspace{0.10in}');
  lines.push('\\ReportFine{Scores are directional and explainable: each is the stated ratio over the bounded observation set, not a weighted model.}');
  lines.push('\\end{minipage}');
  lines.push('\\hfill');
  lines.push('\\begin{minipage}[t]{0.32\\linewidth}');
  lines.push(`\\MetricCard{Platform}{${esc(context.platform_detection?.platform || 'unknown')}}{Detected at ${esc(context.platform_detection?.confidence || 'Unknown')} confidence from observed payloads.}`);
  lines.push('\\vspace{0.09in}');
  lines.push(`\\MetricCard{Inspection Status}{${esc(context.overall_inspection_status || 'unknown')}}{Overall confidence: ${esc(context.overall_confidence || 'Unknown')}.}`);
  lines.push('\\vspace{0.09in}');
  lines.push(`\\MetricCard{Observations}{${observed.reduce((sum, entry) => sum + (entry.observations || 0), 0)}}{Bounded endpoint observations behind this report.}`);
  lines.push('\\end{minipage}');

  // Page 2: findings + opportunities
  lines.push('\\newpage');
  lines.push('\\ReportPageHeader{Findings}');
  lines.push('\\ReportFooter');
  lines.push('\\ReportSection{Key Findings}');
  lines.push('\\begin{minipage}[t]{0.48\\linewidth}');
  findingBlocks.forEach((finding, index) => {
    if (index > 0) lines.push('\\vspace{0.12in}');
    const kicker = finding.type === 'strength' ? `Strength · ${finding.surface}` : `${finding.severity} · ${finding.surface}`;
    lines.push(`\\FindingBlock{${esc(kicker)}}{${esc(finding.observation)}}{${esc(finding.customer_impact)} ${esc(finding.business_impact)}}`);
  });
  if (findingBlocks.length === 0) {
    lines.push('\\ReportCard{Findings}{The source inspection produced no scoreable findings; see the limitations page.}');
  }
  lines.push('\\end{minipage}');
  lines.push('\\hfill');
  lines.push('\\begin{minipage}[t]{0.46\\linewidth}');
  if (opportunities.length) {
    lines.push('\\ReportSection{Opportunity Matrix}');
    lines.push('\\begin{tabularx}{\\linewidth}{@{}L{0.28\\linewidth}N@{}}');
    lines.push('\\toprule');
    lines.push('\\textbf{Classification} & \\textbf{Opportunity}\\\\');
    lines.push('\\midrule');
    for (const opportunity of opportunities.slice(0, 8)) {
      lines.push(`${esc(opportunity.classification)} & ${esc(opportunity.opportunity)}\\\\`);
    }
    lines.push('\\bottomrule');
    lines.push('\\end{tabularx}');
    lines.push('\\vspace{0.12in}');
  }
  lines.push(`\\ReportCard{How to Read This}{Every finding ties to a retained evidence file from inspection ${esc(executive.generated_from_inspection)}; nothing here is opinion without an observation behind it. Surfaces that could not be observed carry no claims.}`);
  if (gaps.length) {
    lines.push('\\vspace{0.12in}');
    lines.push(`\\ReportCard{Not Observed}{${esc(gaps.map((gap) => gap.observation).join(' '))}}`);
  }
  lines.push('\\end{minipage}');

  // Page 3: limitations + evidence references
  lines.push('\\newpage');
  lines.push('\\ReportPageHeader{Evidence and Limits}');
  lines.push('\\ReportFooter');
  lines.push('\\ReportSection{What This Report Does Not Claim}');
  lines.push('\\begin{itemize}');
  for (const limitation of limitations) {
    lines.push(`\\item \\ReportBody{${esc(limitation)}}`);
  }
  lines.push('\\end{itemize}');
  lines.push('\\vspace{0.14in}');
  lines.push('\\ReportSection{Evidence References}');
  lines.push(`\\ReportFine{Source inspection: ${esc(executive.inspection_run_dir)} (${esc(executive.generated_from_inspection)}, inspected ${esc(inspectedDate)}).}\\par`);
  lines.push('\\begin{itemize}');
  for (const entry of scorecard.filter((item) => item.evidence_file)) {
    lines.push(`\\item \\ReportFine{${esc(entry.surface)}: ${esc(entry.evidence_file)}}`);
  }
  lines.push('\\end{itemize}');
  lines.push('\\vfill');
  lines.push('\\begin{center}');
  lines.push('{\\fontsize{16}{19}\\selectfont\\bfseries\\color{NVIInk}Northvalley Intelligence}\\\\[0.06in]');
  lines.push('{\\color{NVIAccent}\\rule{2.2in}{0.8pt}}\\\\[0.08in]');
  lines.push('\\ReportFine{\\NorthvalleyContactLine}');
  lines.push('\\end{center}');
  lines.push('\\end{document}');
  return `${lines.join('\n')}\n`;
}

export function renderExecutivePdf(rootDir, runDir) {
  const resolvedRunDir = path.isAbsolute(runDir) ? runDir : path.join(rootDir, runDir);
  const executivePath = path.join(resolvedRunDir, 'executive', 'executive-report.json');
  if (!exists(executivePath)) {
    throw new Error('No executive-report.json in this run; generate the executive report first.');
  }
  if (!latexmkAvailable()) {
    throw new Error('latexmk is not available; install a LaTeX toolchain to render the PDF.');
  }
  const executive = readJson(executivePath);
  const assetPath = path.resolve(rootDir, 'northvalley-template-assets');
  if (!exists(path.join(assetPath, 'northvalley-brand.sty'))) {
    throw new Error('northvalley-template-assets/northvalley-brand.sty not found in the project root.');
  }
  const texPath = path.join(resolvedRunDir, 'executive', 'executive-report.tex');
  writeText(texPath, buildTex(executive, assetPath));
  const compile = spawnSync('latexmk', ['-pdf', '-interaction=nonstopmode', '-halt-on-error', '-cd', texPath], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 180000
  });
  if (compile.status !== 0) {
    const tail = `${compile.stdout || ''}\n${compile.stderr || ''}`.split('\n').filter(Boolean).slice(-12).join('\n');
    throw new Error(`latexmk failed:\n${tail}`);
  }
  spawnSync('latexmk', ['-c', '-cd', texPath], { cwd: rootDir, stdio: 'ignore' });
  const pdfPath = path.join(resolvedRunDir, 'executive', 'executive-report.pdf');
  if (!exists(pdfPath)) throw new Error('latexmk reported success but no PDF was produced.');
  return {
    inspection_id: executive.generated_from_inspection,
    tex_path: path.relative(rootDir, texPath),
    pdf_path: path.relative(rootDir, pdfPath)
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node src/evaluator/render-executive-pdf.mjs <inspection-run-dir>');
    process.exit(1);
  }
  console.log(JSON.stringify(renderExecutivePdf(process.cwd(), runDir), null, 2));
}
