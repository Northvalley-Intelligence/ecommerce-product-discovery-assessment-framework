import path from 'node:path';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(value) {
  const normalized = String(value || '').toLowerCase();
  if (['pass', 'complete', 'completed', 'ready', 'bounded'].includes(normalized)) return 'status-pass';
  if (['warn', 'partial', 'limited'].includes(normalized)) return 'status-warn';
  if (['fail', 'failed', 'blocked', 'not_ready', 'not ready'].includes(normalized)) return 'status-fail';
  return 'status-muted';
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'Unknown';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} sec`;
  return `${Math.round(ms / 60000)} min`;
}

function relativeArtifact(outputDir, artifactPath) {
  if (!artifactPath) return '#';
  const relative = path.relative(outputDir, artifactPath).replaceAll(path.sep, '/');
  return relative.startsWith('..') ? artifactPath : relative;
}

function metricCard(label, value, detail, className = '') {
  return `
    <article class="metric ${className}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      ${detail ? `<div class="metric-detail">${escapeHtml(detail)}</div>` : ''}
    </article>
  `;
}

function section(title, body, options = {}) {
  return `
    <section class="section ${options.compact ? 'section-compact' : ''}" id="${escapeHtml(options.id || '')}">
      <div class="section-heading">
        <h2>${escapeHtml(title)}</h2>
        ${options.kicker ? `<span>${escapeHtml(options.kicker)}</span>` : ''}
      </div>
      ${body}
    </section>
  `;
}

function table(headers, rows, emptyText = 'No records.') {
  if (!rows || rows.length === 0) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
}

function statusPill(status) {
  return `<span class="status ${statusClass(status)}">${escapeHtml(String(status || 'unknown').toUpperCase())}</span>`;
}

function buildCrawlHealth(report) {
  return section(
    'Crawl Health',
    table(
      ['Surface', 'Status', 'Confidence', 'Evidence Notes'],
      (report.crawl_health || []).map(
        (entry) => `
          <tr>
            <td class="strong">${escapeHtml(entry.component)}</td>
            <td>${statusPill(entry.status)}</td>
            <td>${escapeHtml(entry.confidence || 'Unknown')}</td>
            <td>${escapeHtml(entry.notes || '')}</td>
          </tr>
        `
      )
    ),
    { id: 'crawl-health', kicker: 'Inspection phases' }
  );
}

function buildReadiness(report) {
  const dashboard = report.dashboard || {};
  const operational = dashboard.operational_summary || {};
  const limitations = report.limitations || {};
  const platformGaps = limitations.platform_capability_gaps || [];
  const infrastructureLimits = limitations.infrastructure_limitations || [];
  const blockerRows = [
    ...platformGaps.map(
      (gap) => `
        <tr>
          <td>${statusPill('fail')}</td>
          <td>Platform capability</td>
          <td>${escapeHtml(`${gap.capability_id || ''} ${gap.name || ''}`.trim())}</td>
          <td>${escapeHtml(gap.notes || '')}</td>
        </tr>
      `
    ),
    ...infrastructureLimits.slice(0, 8).map(
      (limit) => `
        <tr>
          <td>${statusPill('blocked')}</td>
          <td>Infrastructure</td>
          <td>${escapeHtml(limit.label || limit.code || 'Limitation')}</td>
          <td>${escapeHtml(`${limit.status || ''} ${limit.url || limit.endpoint || limit.query_id || ''}`.trim())}</td>
        </tr>
      `
    )
  ];

  return section(
    'Report Readiness',
    `
      <div class="readiness">
        <div>
          ${statusPill(operational.downstream_report_readiness)}
          <p>${escapeHtml(operational.readiness_notes || '')}</p>
        </div>
        <div class="readiness-stats">
          <span>${escapeHtml(platformGaps.length)} platform gap${platformGaps.length === 1 ? '' : 's'}</span>
          <span>${escapeHtml(infrastructureLimits.length)} infrastructure limitation${infrastructureLimits.length === 1 ? '' : 's'}</span>
          <span>${escapeHtml(operational.blocked_experiments || 0)} blocked experiment${operational.blocked_experiments === 1 ? '' : 's'}</span>
        </div>
      </div>
      ${table(['State', 'Category', 'Issue', 'Evidence'], blockerRows, 'No blockers recorded.')}
    `,
    { id: 'readiness', kicker: 'Can downstream reports be generated?' }
  );
}

function buildCoverage(report) {
  const coverage = report.dashboard?.evidence_coverage || {};
  const percent = Math.max(0, Math.min(100, Number(coverage.component_coverage_percent || 0)));
  return section(
    'Evidence Coverage',
    `
      <div class="coverage-layout">
        <div class="coverage-meter" aria-label="Evidence coverage ${percent}%">
          <div style="width: ${percent}%"></div>
        </div>
        <div class="coverage-number">${percent}%</div>
      </div>
      <div class="metric-grid small">
        ${metricCard('Plugin Observations', coverage.plugin_observations || 0, 'Rows captured by active plugins')}
        ${metricCard('Dataset Rows', coverage.dataset_rows || 0, 'Generated DS1-DS4 rows')}
        ${metricCard('Evidence Quality', coverage.evidence_quality || 'Unknown', 'Coverage and completeness')}
      </div>
    `,
    { id: 'coverage', kicker: 'Collected vs expected surfaces' }
  );
}

function buildPlugins(report) {
  return section(
    'Experiment Results',
    table(
      ['Plugin', 'Status', 'Observations', 'Confidence', 'Evidence Quality', 'Evidence File'],
      (report.plugin_results || []).map((plugin) => {
        const href = relativeArtifact(report.__outputDir, plugin.evidence_file);
        return `
          <tr>
            <td class="strong">${escapeHtml(plugin.plugin_id)}</td>
            <td>${statusPill(plugin.status)}</td>
            <td>${escapeHtml(plugin.observations || 0)}</td>
            <td>${escapeHtml(plugin.confidence || 'Unknown')}</td>
            <td>${escapeHtml(plugin.evidence_quality || 'Unknown')}</td>
            <td><a href="${escapeHtml(href)}">${escapeHtml(path.basename(plugin.evidence_file || 'evidence'))}</a></td>
          </tr>
        `;
      })
    ),
    { id: 'experiments', kicker: 'Submitted search and autocomplete' }
  );
}

function buildDatasets(report) {
  return section(
    'Datasets',
    table(
      ['Dataset', 'Status', 'Rows', 'Artifact'],
      Object.entries(report.datasets || {}).map(([datasetId, dataset]) => {
        const href = relativeArtifact(report.__outputDir, dataset.path);
        return `
          <tr>
            <td class="strong">${escapeHtml(datasetId)}</td>
            <td>${statusPill(dataset.status)}</td>
            <td>${escapeHtml(dataset.rows)}</td>
            <td><a href="${escapeHtml(href)}">${escapeHtml(path.basename(dataset.path || datasetId))}</a></td>
          </tr>
        `;
      })
    ),
    { id: 'datasets', kicker: 'Reusable query evidence' }
  );
}

function buildPlatform(report) {
  const platformReport = report.platform_capability_report || {};
  return section(
    'Platform Capability',
    table(
      ['Capability', 'Status', 'Maturity', 'Validator', 'Notes'],
      (platformReport.checks || []).map(
        (check) => `
          <tr>
            <td class="strong">${escapeHtml(`${check.capability_id} ${check.name}`)}</td>
            <td>${statusPill(check.status)}</td>
            <td>${escapeHtml(check.maturity_level || 'Unknown')}</td>
            <td>${escapeHtml(check.validator || '')}</td>
            <td>${escapeHtml(check.notes || '')}</td>
          </tr>
        `
      )
    ),
    { id: 'platform', kicker: `Evaluator status: ${platformReport.overall_status || 'unknown'}` }
  );
}

function buildEndpoints(report) {
  return section(
    'Endpoint Discovery',
    table(
      ['Endpoint', 'Status', 'Result', 'Confidence', 'URL'],
      (report.endpoint_discovery || []).map(
        (endpoint) => `
          <tr>
            <td class="strong">${escapeHtml(endpoint.label)}</td>
            <td>${statusPill(endpoint.ok ? 'pass' : 'fail')}</td>
            <td>${escapeHtml(endpoint.classification?.label || (endpoint.ok ? 'Accessible' : 'Unavailable'))}</td>
            <td>${escapeHtml(endpoint.confidence || 'Unknown')}</td>
            <td><span class="mono">${escapeHtml(endpoint.url)}</span></td>
          </tr>
        `
      )
    ),
    { id: 'endpoints', kicker: 'Observed access paths' }
  );
}

function buildTimeline(report, timelineRows) {
  return section(
    'Inspection Timeline',
    table(
      ['Time', 'Event', 'Details'],
      (timelineRows || []).slice(-24).map((entry) => {
        const { at, event, inspection_id, ...details } = entry;
        return `
          <tr>
            <td class="nowrap">${escapeHtml(at || '')}</td>
            <td class="strong">${escapeHtml(titleCase(event || 'event'))}</td>
            <td><span class="mono">${escapeHtml(JSON.stringify(details))}</span></td>
          </tr>
        `;
      })
    ),
    { id: 'timeline', kicker: 'Chronological run record' }
  );
}

function buildArtifacts(report) {
  const groups = report.artifact_explorer?.groups || report.dashboard?.artifact_explorer || {};
  const body = Object.entries(groups)
    .map(([group, files]) => {
      const links = (files || [])
        .map((file) => {
          const href = relativeArtifact(report.__outputDir, file);
          return `<li><a href="${escapeHtml(href)}">${escapeHtml(path.basename(file))}</a><span>${escapeHtml(file)}</span></li>`;
        })
        .join('');
      return `
        <div class="artifact-group">
          <h3>${escapeHtml(titleCase(group))}</h3>
          ${links ? `<ul>${links}</ul>` : '<div class="empty compact">No artifacts.</div>'}
        </div>
      `;
    })
    .join('');

  return section('Artifact Explorer', `<div class="artifact-grid">${body}</div>`, {
    id: 'artifacts',
    kicker: 'Raw evidence and generated outputs'
  });
}

function buildHeader(report) {
  const dashboard = report.dashboard || {};
  const summary = dashboard.crawl_summary || {};
  const operational = dashboard.operational_summary || {};
  const platform = summary.platform_detection || {};
  return `
    <header class="hero">
      <div>
        <p class="eyebrow">Inspection Dashboard</p>
        <h1>${escapeHtml(report.target?.name || summary.target_name || 'Ecommerce Inspection')}</h1>
        <div class="subline">
          <span>${escapeHtml(report.inspection_id)}</span>
          <span>${escapeHtml(summary.target_url || report.target?.primary_url || '')}</span>
          <span>${escapeHtml(report.generated_at || '')}</span>
        </div>
      </div>
      <div class="hero-status">
        ${statusPill(summary.overall_inspection_status)}
        <span>${escapeHtml(operational.downstream_report_readiness || 'unknown')}</span>
      </div>
    </header>
    <main>
      <section class="metric-grid primary" aria-label="Inspection status metrics">
        ${metricCard('Inspection Status', summary.overall_inspection_status || 'Unknown', 'Overall run state', statusClass(summary.overall_inspection_status))}
        ${metricCard('Report Readiness', operational.downstream_report_readiness || 'Unknown', operational.readiness_notes || '', statusClass(operational.downstream_report_readiness))}
        ${metricCard('Evidence Quality', summary.evidence_quality || 'Unknown', 'Observed evidence completeness', statusClass(summary.evidence_quality))}
        ${metricCard('Overall Confidence', summary.overall_confidence || 'Unknown', 'Trust in collected evidence', statusClass(summary.overall_confidence))}
        ${metricCard('Platform', platform.platform || 'Unknown', `${platform.confidence || 'Unknown'} confidence`)}
        ${metricCard('Duration', formatDuration(summary.inspection_duration_ms), 'Inspection runtime')}
      </section>
  `;
}

function buildStyles() {
  return `
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5d6978;
      --line: #d9dee6;
      --blue: #285c9d;
      --green: #197048;
      --amber: #9a6500;
      --red: #b42318;
      --soft-blue: #e8f1fb;
      --soft-green: #e7f6ee;
      --soft-amber: #fff4db;
      --soft-red: #fde8e5;
      --soft-gray: #eef1f5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 32px 40px 24px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    .eyebrow {
      margin: 0 0 4px;
      color: var(--blue);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    h2, h3 { letter-spacing: 0; }
    .subline {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .hero-status {
      min-width: 180px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
      text-transform: uppercase;
      font-weight: 700;
    }
    main {
      width: min(1440px, calc(100% - 48px));
      margin: 24px auto 56px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .metric-grid.primary {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .metric-grid.small {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 16px;
      margin-bottom: 0;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-height: 116px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .metric-value {
      margin-top: 10px;
      font-size: 24px;
      line-height: 1.15;
      font-weight: 750;
      overflow-wrap: anywhere;
    }
    .metric-detail {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .metric.status-pass { border-color: #9bd6b6; background: var(--soft-green); }
    .metric.status-warn { border-color: #e5c46f; background: var(--soft-amber); }
    .metric.status-fail { border-color: #f0a19a; background: var(--soft-red); }
    .section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 18px;
      overflow: hidden;
    }
    .section-heading {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .section-heading h2 {
      margin: 0;
      font-size: 18px;
    }
    .section-heading span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      background: #fbfcfd;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    tr:last-child td { border-bottom: 0; }
    .strong { font-weight: 700; }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .nowrap { white-space: nowrap; }
    .status {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0;
      white-space: nowrap;
    }
    .status-pass { background: var(--soft-green); color: var(--green); border: 1px solid #9bd6b6; }
    .status-warn { background: var(--soft-amber); color: var(--amber); border: 1px solid #e5c46f; }
    .status-fail { background: var(--soft-red); color: var(--red); border: 1px solid #f0a19a; }
    .status-muted { background: var(--soft-gray); color: var(--muted); border: 1px solid var(--line); }
    .readiness {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
    }
    .readiness p {
      margin: 10px 0 0;
      color: var(--muted);
    }
    .readiness-stats {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      min-width: 280px;
    }
    .readiness-stats span {
      padding: 7px 10px;
      background: var(--soft-gray);
      border: 1px solid var(--line);
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
    }
    .coverage-layout {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 22px 20px 0;
    }
    .coverage-meter {
      height: 18px;
      border-radius: 999px;
      background: var(--soft-gray);
      border: 1px solid var(--line);
      overflow: hidden;
    }
    .coverage-meter div {
      height: 100%;
      background: var(--blue);
    }
    .coverage-number {
      font-size: 26px;
      font-weight: 800;
      color: var(--blue);
    }
    .artifact-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0;
    }
    .artifact-group {
      padding: 16px 20px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      min-height: 140px;
    }
    .artifact-group:nth-child(2n) { border-right: 0; }
    .artifact-group h3 {
      margin: 0 0 12px;
      font-size: 14px;
    }
    .artifact-group ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 8px;
    }
    .artifact-group li {
      display: grid;
      gap: 2px;
    }
    .artifact-group li span {
      color: var(--muted);
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .empty {
      padding: 18px 20px;
      color: var(--muted);
      font-size: 13px;
    }
    .empty.compact { padding: 0; }
    footer {
      padding: 22px 40px;
      color: var(--muted);
      font-size: 12px;
      border-top: 1px solid var(--line);
      background: var(--panel);
    }
    @media (max-width: 1050px) {
      .metric-grid.primary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      .hero {
        padding: 24px 18px;
        flex-direction: column;
      }
      .hero-status { align-items: flex-start; }
      main { width: calc(100% - 24px); margin-top: 14px; }
      .metric-grid.primary,
      .metric-grid,
      .metric-grid.small,
      .artifact-grid {
        grid-template-columns: 1fr;
      }
      .readiness,
      .section-heading {
        flex-direction: column;
        align-items: flex-start;
      }
      .readiness-stats { justify-content: flex-start; min-width: 0; }
      .artifact-group { border-right: 0; }
      h1 { font-size: 26px; }
    }
  `;
}

export function buildDashboardHtml({ report, timelineRows = [], outputDir }) {
  const reportWithContext = {
    ...report,
    __outputDir: outputDir
  };
  const title = `${report.target?.name || 'Inspection'} Dashboard`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${buildStyles()}</style>
</head>
<body>
  ${buildHeader(reportWithContext)}
  ${buildReadiness(reportWithContext)}
  ${buildCoverage(reportWithContext)}
  ${buildCrawlHealth(reportWithContext)}
  ${buildPlugins(reportWithContext)}
  ${buildDatasets(reportWithContext)}
  ${buildEndpoints(reportWithContext)}
  ${buildPlatform(reportWithContext)}
  ${buildTimeline(reportWithContext, timelineRows)}
  ${buildArtifacts(reportWithContext)}
  </main>
  <footer>
    Inspection evidence artifact: ${escapeHtml(report.inspection_id)}. Generated from inspection-report.json.
  </footer>
</body>
</html>
`;
}
