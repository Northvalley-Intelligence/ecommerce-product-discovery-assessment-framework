// Read-only share site: serves the static snapshot built by
// scripts/export-share-site.mjs. Access control (one allowed e-mail) is
// enforced by Cloudflare Access in front of this Worker, outside this repo.

let manifestPromise;

function loadManifest(env) {
  manifestPromise ??= env.ASSETS.fetch('https://assets.invalid/_snap/manifest.json').then((response) => {
    if (!response.ok) throw new Error('snapshot manifest missing');
    return response.json();
  });
  return manifestPromise;
}

// The report-PDF link carries a cache-busting &t=<epoch>; ignore it (matches the exporter).
function snapshotKey(url) {
  if (url.pathname.startsWith('/artifact')) url.searchParams.delete('t');
  const search = url.searchParams.toString();
  return url.pathname + (search ? '?' + search : '');
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
    }
    const url = new URL(request.url);

    if (url.pathname === '/') {
      const index = await env.ASSETS.fetch('https://assets.invalid/index.html');
      return new Response(index.body, {
        status: index.status,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    const manifest = await loadManifest(env);
    const entry = Object.hasOwn(manifest, snapshotKey(url)) ? manifest[snapshotKey(url)] : null;
    if (!entry) return new Response('Not found', { status: 404 });

    const asset = await env.ASSETS.fetch(`https://assets.invalid/_snap/${entry.file}`);
    if (!asset.ok) return new Response('Not found', { status: 404 });
    return new Response(asset.body, {
      headers: { 'content-type': entry['content-type'], 'cache-control': 'no-store' }
    });
  }
};
