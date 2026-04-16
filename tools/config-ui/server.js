'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ADMIN_PORT = Number(process.env.CONFIG_UI_PORT) || 5380;
const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');

function log(message) {
  console.log(`[config-ui] ${message}`);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkAuth(req) {
  const password = process.env.CONFIG_UI_PASSWORD || '';
  if (!password) return false;

  const username = process.env.CONFIG_UI_USERNAME || 'admin';
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Basic ')) return false;

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');
  return timingSafeEqual(user, username) && timingSafeEqual(pass, password);
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function send401(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Config UI"',
    'Content-Type': 'text/plain',
  });
  res.end('Unauthorized');
}

const MAX_BODY_SIZE = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseRoute(url) {
  const [pathname] = url.split('?');
  const parts = pathname.split('/').filter(Boolean);
  return { pathname, parts };
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const modules = [];

function registerModule(mod) {
  modules.push(mod);
  log(`registered module: ${mod.id}`);
}

function getModuleManifest() {
  return modules.map((m) => ({ id: m.id, label: m.label }));
}

async function routeToModule(method, pathname, parts, req, res) {
  if (parts.length < 3 || parts[0] !== 'api' || parts[1] !== 'modules') return false;

  const moduleId = parts[2];
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) return false;

  const subParts = parts.slice(3);
  const subPath = '/' + subParts.join('/');
  return mod.handleRequest(method, subPath, subParts, req, res, { readBody, sendJson, loadJson, saveJson });
}

async function handleRequest(req, res) {
  if (!checkAuth(req)) return send401(res);

  const { pathname, parts } = parseRoute(req.url);
  const method = req.method;

  if (method === 'GET' && pathname === '/') {
    try {
      const html = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Admin UI not found');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/modules') {
    return sendJson(res, 200, getModuleManifest());
  }

  const handled = await routeToModule(method, pathname, parts, req, res);
  if (handled) return;

  sendJson(res, 404, { error: 'not found' });
}

function main() {
  if (!process.env.CONFIG_UI_PASSWORD) {
    log('refusing to start: CONFIG_UI_PASSWORD is not set');
    process.exit(1);
  }

  const dnsmasqModule = require('./modules/dnsmasq');
  const prometheusModule = require('./modules/prometheus');

  dnsmasqModule.init();
  prometheusModule.init();

  registerModule(dnsmasqModule);
  registerModule(prometheusModule);

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log(`request error: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    });
  });

  server.listen(ADMIN_PORT, '0.0.0.0', () => {
    log(`admin UI listening on port ${ADMIN_PORT}`);
  });

  const shutdown = (signal) => {
    log(`received ${signal}, shutting down`);
    modules.forEach((m) => { if (m.shutdown) m.shutdown(); });
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
