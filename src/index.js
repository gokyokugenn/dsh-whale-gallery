import { readFile } from 'node:fs/promises';
import manifest from '../assets/manifest.json' with { type: 'json' };

export const name = 'ui-skin-whale-gallery';

/** Public artwork only: immutable names, a closed allowlist and no arbitrary disk paths. */
export function apply(ctx) {
  const files = new Set(manifest.files);
  const directory = new URL('../assets/', import.meta.url);
  const prefix = '/skin-assets/whale-gallery/';
  ctx.inject(['webServer'], web => {
    web.effect(() => web.get('webServer').register({
      kind: 'prefix', path: prefix.slice(0, -1),
      async handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' }).end();
          return;
        }
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        const file = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
        if (!/^[a-f0-9]{64}\.png$/.test(file) || !files.has(file)) {
          res.writeHead(404).end();
          return;
        }
        let bytes;
        try { bytes = await readFile(new URL(file, directory)); }
        catch { res.writeHead(404).end(); return; }
        const etag = '"' + file.slice(0, 64) + '"';
        const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', ETag: etag };
        if (req.headers['if-none-match']?.split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')) {
          res.writeHead(304, headers).end();
          return;
        }
        res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      },
    }), 'whale-gallery: immutable local artwork');

  });
}
