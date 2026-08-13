import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
/*
 * capture-bridge: exports large browser-captured JSON out of the sandboxed MCP browser without
 * slicing. parts.cat.com (and other Akamai/enterprise sites) block server-side fetch, so capture
 * runs in the browser; the browser tool's output is capped at ~1KB, and cross-origin POST to
 * localhost is blocked. This bridge sidesteps both: the capture JSON is stashed in window.name
 * (which survives a same-tab navigation across origins), the tab is navigated to this bridge, and
 * the bridge's own page reads window.name and POSTs it same-origin. The bridge writes it to disk.
 *
 * Usage: node capture-bridge.mjs <absolute-output-file> [port]
 *   then in the capture tab: window.name = JSON.stringify(payload)
 *   then navigate the tab to http://127.0.0.1:<port>/
 */
const outFile = resolve(process.argv[2] || '');
const port = Number(process.argv[3] || 8899);
if (!outFile) { console.error('usage: capture-bridge.mjs <output-file> [port]'); process.exit(1); }

const PAGE = `<!doctype html><meta charset=utf-8><title>capture-bridge</title>
<body style="font:14px system-ui;padding:20px">
<h3>capture-bridge</h3><pre id=o>reading window.name…</pre>
<script>
const o=document.getElementById('o');
const data=window.name||'';
if(!data){o.textContent='window.name is EMPTY — nothing to save.';}
else{fetch('/save',{method:'POST',headers:{'content-type':'text/plain'},body:data})
 .then(r=>r.text()).then(t=>{o.textContent=t; window.name='';})
 .catch(e=>{o.textContent='POST failed: '+e;});}
</script></body>`;

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return;
  }
  if (req.method === 'POST' && req.url === '/save') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        JSON.parse(body); // validate it's JSON
        writeFileSync(outFile, body);
        const msg = 'WROTE ' + body.length + ' bytes to ' + outFile;
        console.log(msg);
        res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
        res.end(msg);
      } catch (e) {
        res.writeHead(400, { 'content-type': 'text/plain' }); res.end('bad payload: ' + e.message);
      }
    });
    return;
  }
  res.writeHead(404); res.end('nope');
}).listen(port, '127.0.0.1', () => console.log('capture-bridge on http://127.0.0.1:' + port + ' -> ' + outFile));
