import { createServer } from 'http';
import { Readable } from 'stream';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = join(__dirname, 'dist');
const API_PROXY_TARGET = process.env.API_PROXY_TARGET?.trim();

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (req.url.startsWith('/api')) {
    if (!API_PROXY_TARGET) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'API proxy target is not configured. Set API_PROXY_TARGET or fill API URL in the UI.',
      }));
      return;
    }

    try {
      const upstreamUrl = new URL(req.url.replace(/^\/api/, ''), API_PROXY_TARGET);
      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([key]) => key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length')
        ),
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
        duplex: req.method === 'GET' || req.method === 'HEAD' ? undefined : 'half',
      });

      res.writeHead(upstream.status, Object.fromEntries(
        Array.from(upstream.headers.entries()).filter(([key]) => key.toLowerCase() !== 'content-encoding')
      ));

      if (!upstream.body) {
        res.end();
        return;
      }

      Readable.fromWeb(upstream.body).pipe(res);
      return;
    } catch (error) {
      console.error('API proxy error:', error);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream API unavailable' }));
      return;
    }
  }

  let filePath = join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(DIST_DIR, 'index.html');
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end('Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (API_PROXY_TARGET) {
    console.log(`Proxying /api to ${API_PROXY_TARGET}`);
  } else {
    console.log('No default API proxy configured. Set API_PROXY_TARGET to enable /api proxy.');
  }
  console.log('Press Ctrl+C to stop');
});
