// Share mode for the dashboard page: turns the operator dashboard HTML into a
// read-only view. Every edit is an exact, asserted replacement (it throws if
// the dashboard source drifts), so a change to the page can never silently
// leave an operator control in the share build.
//
// The default dashboard output is untouched; this only runs for
// dashboardPage({ share: true }).

const FN_START = /^ {4}(?:async )?function \w+/;

function once(html, needle, replacement) {
  const first = html.indexOf(needle);
  if (first === -1) throw new Error(`share-transform: marker not found: ${needle.slice(0, 80)}`);
  if (html.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`share-transform: marker not unique: ${needle.slice(0, 80)}`);
  }
  return html.slice(0, first) + replacement + html.slice(first + needle.length);
}

function removeLine(html, fragment) {
  const lines = html.split('\n');
  const hits = lines.filter((line) => line.includes(fragment));
  if (hits.length !== 1) throw new Error(`share-transform: expected exactly one line containing ${fragment.slice(0, 80)} (found ${hits.length})`);
  return lines.filter((line) => !line.includes(fragment)).join('\n');
}

// Replace a whole top-level client function (from its signature line to the
// line before the next top-level function) with `replacement`.
function replaceFunction(html, signature, replacement) {
  const lines = html.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith(`    ${signature}`));
  if (startIdx === -1) throw new Error(`share-transform: function not found: ${signature}`);
  let endIdx = startIdx + 1;
  while (endIdx < lines.length && !FN_START.test(lines[endIdx]) && !/^ {4}document\./.test(lines[endIdx])) endIdx += 1;
  lines.splice(startIdx, endIdx - startIdx, ...(replacement ? [replacement] : []));
  return lines.join('\n');
}

function cutBetween(html, startMarker, endMarker, keepEnd = true) {
  const a = html.indexOf(startMarker);
  if (a === -1) throw new Error(`share-transform: start marker not found: ${startMarker.slice(0, 80)}`);
  const b = html.indexOf(endMarker, a);
  if (b === -1) throw new Error(`share-transform: end marker not found: ${endMarker.slice(0, 80)}`);
  return html.slice(0, a) + (keepEnd ? html.slice(b) : html.slice(b + endMarker.length));
}

export function applyShareMode(source) {
  let html = source;

  // Marker for client code, plus a guard so the page can never issue a write.
  html = once(html, '<head>', '<head>\n  <script>window.__SHARE__ = true;</script>');
  html = once(html, 'async function api(path, options) {\n',
    "async function api(path, options) {\n      if (window.__SHARE__ && options && options.method && String(options.method).toUpperCase() !== 'GET') throw new Error('Read-only share: writes are disabled.');\n");

  // Chrome: operator tabs, New Inspection, run-queue strip text.
  html = removeLine(html, 'id="tabShared"');
  html = removeLine(html, 'id="tabSettings" class="tab"');
  html = once(html, '<p class="muted">Run, review, debug, compare, and decide report readiness.</p>',
    '<p class="muted">Read-only view of the search-relevance boards.</p>');
  html = cutBetween(html, '        <section class="page-actions">', '        <div id="queueStrip"');
  html = once(html, 'No Shopify sites yet. Use New Inspection to add one.', 'No sites to show.');
  html = removeLine(html, "document.getElementById('newInspectionBtn').addEventListener");
  html = removeLine(html, "document.getElementById('tabShared').addEventListener");
  html = removeLine(html, "document.getElementById('tabSettings').addEventListener");
  html = removeLine(html, "document.getElementById('tabShared').classList.toggle");
  html = removeLine(html, "document.getElementById('tabSettings').classList.toggle");

  // Only the browser-evaluated boards are part of the share site.
  html = replaceFunction(html, 'function renderSiteView(targetId) {',
    "    function renderSiteView(targetId) {\n      const site = (state.sites || []).find((entry) => entry.target_id === targetId);\n      if (site && site.platform === 'browser-eval') renderBrowserEvalSite(site);\n    }");
  html = cutBetween(html, '    function renderWooSite(site) {', '    function renderBrowserEvalSite(site) {');
  html = replaceFunction(html, 'function renderDetail(data) {', '    function renderDetail() {}');
  html = replaceFunction(html, 'async function cleanupFlow() {', '');
  html = replaceFunction(html, 'async function renderSettings() {', '');
  html = replaceFunction(html, 'function renderQueue(data) {', '');
  html = replaceFunction(html, 'async function pollQueue() {', '    function pollQueue() {}');
  html = replaceFunction(html, 'async function renderSetup(targetId) {', '');
  html = replaceFunction(html, 'async function runAction(kind) {', '');
  html = replaceFunction(html, 'async function applyHash() {',
    "    async function applyHash() {\n      setView('inspections');\n      renderSitesNav();\n      if (state.selectedSite) renderSiteView(state.selectedSite);\n      else if (state.sites && state.sites.length) selectSite(state.sites[0].target_id);\n    }");

  // Board: no Keyword Planner paste/import, no custom-dataset upload.
  html = once(html, "(data.invalidated ? '' : pdfLink + copyLine + pasteLine)", "(data.invalidated ? '' : pdfLink)");
  html = cutBetween(html, '      // Demand overlay affordance', '      // Findings panel (severity-ranked)');
  html = cutBetween(html, '      // Custom-dataset upload: paste a spec-conforming dataset', '      el.innerHTML =\n        stageStripHtml');
  html = once(html, 'findingsPanel + revenuePanel + uploadPanel;', 'findingsPanel + revenuePanel;');
  html = cutBetween(html, '      var copyBtnT = el.querySelector', '    }\n    async function loadSearchScoreboard');

  return html;
}
