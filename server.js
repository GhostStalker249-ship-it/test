const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { collectAll, defaultConfig, providers } = require('./src/providers');

const publicDir = path.join(__dirname, 'public');

function jsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function serveFile(res, filePath) {
  try {
    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
    }[ext] || 'application/octet-stream';

    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/providers') {
      jsonResponse(
        res,
        200,
        Object.entries(providers).map(([id, meta]) => ({
          id,
          title: meta.title,
        })),
      );
      return;
    }

    if (url.pathname === '/api/config') {
      jsonResponse(res, 200, defaultConfig);
      return;
    }

    if (url.pathname === '/api/metrics') {
      const metrics = await collectAll();
      jsonResponse(res, 200, {
        timestamp: Date.now(),
        refreshIntervalSeconds: defaultConfig.refreshIntervalSeconds,
        metrics,
      });
      return;
    }

    const safePath = path.normalize(url.pathname).replace(/^\.\.(\/|\\|$)/, '');
    const requested = safePath === '/' ? '/index.html' : safePath;
    const filePath = path.join(publicDir, requested);

    if (filePath.startsWith(publicDir)) {
      await serveFile(res, filePath);
      return;
    }

    res.writeHead(403);
    res.end('Forbidden');
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => {
    console.log(`Backup monitoring app is running on http://${host}:${port}`);
  });
}

module.exports = { createServer };
