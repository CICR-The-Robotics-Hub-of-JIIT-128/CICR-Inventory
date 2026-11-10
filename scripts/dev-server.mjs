import http from 'node:http';
import fs from 'node:fs';
import { parse } from 'node:url';
import { createServer } from 'vite';

function loadLocalEnvironment() {
  const envPath = new URL('../.env', import.meta.url);
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const routes = {
  '/api/accounts': './api/accounts.ts',
  '/api/auth': './api/auth.ts',
  '/api/email': './api/email.ts',
  '/api/inventory': './api/inventory.ts',
  '/api/reminders': './api/reminders.ts',
};

function createResponse(res) {
  const response = {
    statusCode: 200,
    status(code) {
      response.statusCode = code;
      return response;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
      return response;
    },
    json(body) {
      res.statusCode = response.statusCode;
      if (!res.hasHeader('content-type')) res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
      return response;
    },
    send(body) {
      res.statusCode = response.statusCode;
      res.end(body);
      return response;
    },
  };
  return response;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (req.headers['content-type']?.includes('application/json')) return JSON.parse(raw);
  return raw;
}

const vite = await createServer({
  server: { middlewareMode: true, host: true, port: 3000 },
  appType: 'spa',
});

const server = http.createServer(async (req, res) => {
  const url = parse(req.url || '/', true);
  const modulePath = routes[url.pathname];

  if (modulePath) {
    try {
      const handler = (await vite.ssrLoadModule(modulePath)).default;
      req.query = url.query;
      req.body = await readBody(req);
      await handler(req, createResponse(res));
    } catch (error) {
      console.error(`API request failed: ${url.pathname}`, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'API request failed.' }));
      }
    }
    return;
  }

  vite.middlewares(req, res);
});

server.listen(3000, () => {
  console.log('CICR local app: http://localhost:3000');
});
