'use strict';
const { readBody, sendJson, loadJson, saveJson, checkAuth, send401, isWeakPassword } = require('./http-helpers.js');

const http = require('http');
const fs = require('fs');
const path = require('path');

const ADMIN_PORT = Number(process.env.CONFIG_UI_PORT) || 5380;

function log(message) {
  console.log(`[config-ui] ${message}`);
}

function parseRoute(url) {
  const [pathname] = url.split('?');
  const parts = pathname.split('/').filter(Boolean);
  return { pathname, parts };
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

  const assets = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/style.css': ['style.css', 'text/css; charset=utf-8'],
    '/controls.css': ['controls.css', 'text/css; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/dns.js': ['dns.js', 'text/javascript; charset=utf-8'],
    '/prometheus.js': ['prometheus.js', 'text/javascript; charset=utf-8'],
  };
  if (method === 'GET' && Object.hasOwn(assets, pathname)) {
    const [file, contentType] = assets[pathname];
    try {
      const content = fs.readFileSync(path.join(__dirname, 'public', file), 'utf-8');
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
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
  if (isWeakPassword(process.env.CONFIG_UI_PASSWORD) && process.env.CONFIG_UI_ALLOW_WEAK_PASSWORD !== 'true') {
    log('refusing to start: CONFIG_UI_PASSWORD is too short or a well-known default.');
    log(
      'Set a password of at least 12 characters, or explicitly set CONFIG_UI_ALLOW_WEAK_PASSWORD=true to override (not recommended outside ephemeral dev).',
    );
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
    modules.forEach((m) => {
      if (m.shutdown) m.shutdown();
    });
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
