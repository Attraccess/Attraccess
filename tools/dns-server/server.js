'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const DATA_DIR = process.env.DNS_DATA_DIR || '/data';
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DNSMASQ_CONF_DIR = '/etc/dnsmasq.d';
const DNSMASQ_CONF_FILE = path.join(DNSMASQ_CONF_DIR, 'records.conf');
const DNSMASQ_HOSTS_FILE = path.join(DNSMASQ_CONF_DIR, 'custom-hosts');
const ADMIN_PORT = Number(process.env.DNS_ADMIN_PORT) || 5380;
const LISTEN_ADDRESS = process.env.DNS_LISTEN_ADDRESS || '';
const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');

function log(message) {
  console.log(`[dns-server] ${message}`);
}

function getEnvBoolean(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
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

function loadRecords() {
  return loadJson(RECORDS_FILE, []);
}

function saveRecords(records) {
  saveJson(RECORDS_FILE, records);
}

function loadSettings() {
  const envSettings = {
    upstream1: process.env.DNS_UPSTREAM_1 || '1.1.1.1',
    upstream2: process.env.DNS_UPSTREAM_2 || '8.8.8.8',
    localDomain: process.env.DNS_LOCAL_DOMAIN || '',
    logQueries: getEnvBoolean('DNS_LOG_QUERIES', false),
  };
  const stored = loadJson(SETTINGS_FILE, null);
  return stored || envSettings;
}

function saveSettings(settings) {
  saveJson(SETTINGS_FILE, settings);
}

function generateDnsmasqConfig(settings) {
  const lines = ['no-resolv', 'user=root'];
  if (LISTEN_ADDRESS) {
    lines.push(`listen-address=${LISTEN_ADDRESS}`);
    lines.push('bind-interfaces');
  }
  lines.push(`server=${settings.upstream1 || '1.1.1.1'}`);
  lines.push(`server=${settings.upstream2 || '8.8.8.8'}`);
  lines.push(`addn-hosts=${DNSMASQ_HOSTS_FILE}`);

  if (settings.localDomain) {
    lines.push(`local=/${settings.localDomain}/`);
    lines.push(`domain=${settings.localDomain}`);
  }

  if (settings.logQueries) {
    lines.push('log-queries');
  }

  return lines.join('\n') + '\n';
}

function generateHostsFile(records) {
  return records
    .filter((r) => r.hostname && r.ip)
    .map((r) => `${r.ip} ${r.hostname}`)
    .join('\n') + '\n';
}

function writeDnsmasqConfig(records, settings) {
  try {
    fs.mkdirSync(DNSMASQ_CONF_DIR, { recursive: true });
    fs.writeFileSync(DNSMASQ_CONF_FILE, generateDnsmasqConfig(settings), 'utf-8');
    fs.writeFileSync(DNSMASQ_HOSTS_FILE, generateHostsFile(records), 'utf-8');
    return true;
  } catch (err) {
    log(`failed to write dnsmasq config: ${err.message}`);
    return false;
  }
}

let dnsmasqProcess = null;

function startDnsmasq() {
  if (dnsmasqProcess) return;
  dnsmasqProcess = spawn('dnsmasq', ['--no-daemon', '--conf-dir=/etc/dnsmasq.d'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  dnsmasqProcess.stdout.on('data', (data) => log(`dnsmasq: ${data.toString().trim()}`));
  dnsmasqProcess.stderr.on('data', (data) => log(`dnsmasq: ${data.toString().trim()}`));
  dnsmasqProcess.on('exit', (code) => {
    log(`dnsmasq exited with code ${code}`);
    dnsmasqProcess = null;
  });
  log(`dnsmasq started (pid ${dnsmasqProcess.pid})`);
}

function reloadDnsmasq() {
  if (dnsmasqProcess && dnsmasqProcess.pid) {
    try {
      process.kill(dnsmasqProcess.pid, 'SIGHUP');
      log('sent SIGHUP to dnsmasq');
    } catch (err) {
      log(`failed to send SIGHUP: ${err.message}`);
    }
  }
}

function getDnsmasqStatus() {
  if (!dnsmasqProcess) return { running: false, pid: null };
  try {
    process.kill(dnsmasqProcess.pid, 0);
    return { running: true, pid: dnsmasqProcess.pid };
  } catch {
    return { running: false, pid: null };
  }
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
  const password = process.env.DNS_ADMIN_PASSWORD || '';
  if (!password) return true;

  const username = process.env.DNS_ADMIN_USERNAME || 'admin';
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
    'WWW-Authenticate': 'Basic realm="DNS Admin"',
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

function writeHostsAndReload(records) {
  try {
    fs.writeFileSync(DNSMASQ_HOSTS_FILE, generateHostsFile(records), 'utf-8');
  } catch (err) {
    log(`failed to write hosts file: ${err.message}`);
  }
  reloadDnsmasq();
}

function restartDnsmasq(records, settings) {
  if (dnsmasqProcess) {
    dnsmasqProcess.kill('SIGTERM');
    dnsmasqProcess = null;
  }
  writeDnsmasqConfig(records, settings);
  startDnsmasq();
}

function applyAndReload(records) {
  saveRecords(records);
  writeHostsAndReload(records);
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

  if (method === 'GET' && pathname === '/api/records') {
    return sendJson(res, 200, loadRecords());
  }

  if (method === 'POST' && pathname === '/api/records') {
    const body = await readBody(req);
    if (!body.hostname || !body.ip) return sendJson(res, 400, { error: 'hostname and ip required' });
    const records = loadRecords();
    const newRecord = { id: crypto.randomUUID(), hostname: body.hostname, ip: body.ip };
    records.push(newRecord);
    applyAndReload(records);
    return sendJson(res, 201, newRecord);
  }

  if (method === 'PUT' && parts[0] === 'api' && parts[1] === 'records' && parts[2]) {
    const id = parts[2];
    const body = await readBody(req);
    const records = loadRecords();
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return sendJson(res, 404, { error: 'record not found' });
    if (body.hostname) records[idx].hostname = body.hostname;
    if (body.ip) records[idx].ip = body.ip;
    applyAndReload(records);
    return sendJson(res, 200, records[idx]);
  }

  if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'records' && parts[2]) {
    const id = parts[2];
    let records = loadRecords();
    const before = records.length;
    records = records.filter((r) => r.id !== id);
    if (records.length === before) return sendJson(res, 404, { error: 'record not found' });
    applyAndReload(records);
    return sendJson(res, 200, { deleted: true });
  }

  if (method === 'GET' && pathname === '/api/settings') {
    return sendJson(res, 200, loadSettings());
  }

  if (method === 'PUT' && pathname === '/api/settings') {
    const body = await readBody(req);
    const settings = loadSettings();
    if (body.upstream1 !== undefined) settings.upstream1 = body.upstream1;
    if (body.upstream2 !== undefined) settings.upstream2 = body.upstream2;
    if (body.localDomain !== undefined) settings.localDomain = body.localDomain;
    if (body.logQueries !== undefined) settings.logQueries = Boolean(body.logQueries);
    saveSettings(settings);
    restartDnsmasq(loadRecords(), settings);
    return sendJson(res, 200, settings);
  }

  if (method === 'GET' && pathname === '/api/status') {
    return sendJson(res, 200, getDnsmasqStatus());
  }

  sendJson(res, 404, { error: 'not found' });
}

function main() {
  const records = loadRecords();
  const settings = loadSettings();

  writeDnsmasqConfig(records, settings);
  startDnsmasq();

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      log(`request error: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    });
  });

  server.listen(ADMIN_PORT, LISTEN_ADDRESS || '0.0.0.0', () => {
    log(`admin UI listening on port ${ADMIN_PORT}`);
  });

  process.on('SIGTERM', () => {
    log('received SIGTERM, shutting down');
    if (dnsmasqProcess) dnsmasqProcess.kill('SIGTERM');
    server.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('received SIGINT, shutting down');
    if (dnsmasqProcess) dnsmasqProcess.kill('SIGTERM');
    server.close();
    process.exit(0);
  });
}

main();
