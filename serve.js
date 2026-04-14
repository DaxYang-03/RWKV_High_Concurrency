import express from 'express';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_PROXY_TARGET = process.env.API_PROXY_TARGET?.trim();

app.use('/api', async (req, res) => {
  if (!API_PROXY_TARGET) {
    res.status(503).json({
      error: 'API proxy target is not configured. Set API_PROXY_TARGET or fill API URL in the UI.',
    });
    return;
  }

  try {
    const upstreamUrl = new URL(req.originalUrl.replace(/^\/api/, ''), API_PROXY_TARGET);
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length')
      ),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
      duplex: req.method === 'GET' || req.method === 'HEAD' ? undefined : 'half',
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(502).json({ error: 'Upstream API unavailable' });
  }
});

app.use(express.static(join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (API_PROXY_TARGET) {
    console.log(`Proxying /api to ${API_PROXY_TARGET}`);
  } else {
    console.log('No default API proxy configured. Set API_PROXY_TARGET to enable /api proxy.');
  }
});
