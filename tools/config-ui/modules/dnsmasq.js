'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const DATA_DIR = process.env.DNS_DATA_DIR || '/data';
const RECORDS_FILE = path.join(DATA_DIR, 'dns-records.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'dns-settings.json');
const DNSMASQ_CONF_DIR = '/etc/dnsmasq.d';
const DNSMASQ_CONF_FILE = path.join(DNSMASQ_CONF_DIR, 'records.conf');
const DNSMASQ_HOSTS_FILE = path.join(DNSMASQ_CONF_DIR, 'custom-hosts');
const LISTEN_ADDRESS = process.env.DNS_LISTEN_ADDRESS || '';

function log(message) {
  console.log(`[dnsmasq] ${message}`);
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

function generateDnsmasqConfig(settings, records) {
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

  (records || [])
    .filter((r) => r.hostname && r.ip && r.hostname.startsWith('*.'))
    .forEach((r) => {
      const domain = r.hostname.slice(2);
      lines.push(`address=/${domain}/${r.ip}`);
    });

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
    fs.writeFileSync(DNSMASQ_CONF_FILE, generateDnsmasqConfig(settings, records), 'utf-8');
    fs.writeFileSync(DNSMASQ_HOSTS_FILE, generateHostsFile(records), 'utf-8');
    return true;
  } catch (err) {
    log(`failed to write config: ${err.message}`);
    return false;
  }
}

let dnsmasqProcess = null;

function startDnsmasq() {
  if (dnsmasqProcess) return;
  try {
    dnsmasqProcess = spawn('dnsmasq', ['--no-daemon', '--conf-dir=/etc/dnsmasq.d'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    dnsmasqProcess.stdout.on('data', (data) => log(`${data.toString().trim()}`));
    dnsmasqProcess.stderr.on('data', (data) => log(`${data.toString().trim()}`));
    dnsmasqProcess.on('exit', (code) => {
      log(`exited with code ${code}`);
      dnsmasqProcess = null;
    });
    log(`started (pid ${dnsmasqProcess.pid})`);
  } catch (err) {
    log(`failed to start: ${err.message}`);
    dnsmasqProcess = null;
  }
}

function reloadDnsmasq() {
  if (dnsmasqProcess && dnsmasqProcess.pid) {
    try {
      process.kill(dnsmasqProcess.pid, 'SIGHUP');
      log('sent SIGHUP');
    } catch (err) {
      log(`failed to send SIGHUP: ${err.message}`);
    }
  }
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

function getDnsmasqStatus() {
  if (!dnsmasqProcess) return { running: false, pid: null };
  try {
    process.kill(dnsmasqProcess.pid, 0);
    return { running: true, pid: dnsmasqProcess.pid };
  } catch {
    return { running: false, pid: null };
  }
}

const dnsmasqModule = {
  id: 'dnsmasq',
  label: 'DNS Server',

  init() {
    const enabled = getEnvBoolean('DNS_SERVER_ENABLED', false);
    if (!enabled) {
      log('disabled (set DNS_SERVER_ENABLED=true to enable)');
      return;
    }
    const records = loadRecords();
    const settings = loadSettings();
    writeDnsmasqConfig(records, settings);
    startDnsmasq();
  },

  shutdown() {
    if (dnsmasqProcess) {
      dnsmasqProcess.kill('SIGTERM');
      dnsmasqProcess = null;
    }
  },

  async handleRequest(method, subPath, subParts, req, res, helpers) {
    if (method === 'GET' && subPath === '/status') {
      helpers.sendJson(res, 200, getDnsmasqStatus());
      return true;
    }

    if (method === 'GET' && subPath === '/records') {
      helpers.sendJson(res, 200, loadRecords());
      return true;
    }

    if (method === 'POST' && subPath === '/records') {
      const body = await helpers.readBody(req);
      if (!body.hostname || !body.ip) {
        helpers.sendJson(res, 400, { error: 'hostname and ip required' });
        return true;
      }
      const records = loadRecords();
      const newRecord = { id: crypto.randomUUID(), hostname: body.hostname, ip: body.ip };
      records.push(newRecord);
      applyAndReload(records);
      helpers.sendJson(res, 201, newRecord);
      return true;
    }

    if (method === 'PUT' && subParts[0] === 'records' && subParts[1]) {
      const id = subParts[1];
      const body = await helpers.readBody(req);
      const records = loadRecords();
      const idx = records.findIndex((r) => r.id === id);
      if (idx === -1) {
        helpers.sendJson(res, 404, { error: 'record not found' });
        return true;
      }
      if (body.hostname) records[idx].hostname = body.hostname;
      if (body.ip) records[idx].ip = body.ip;
      applyAndReload(records);
      helpers.sendJson(res, 200, records[idx]);
      return true;
    }

    if (method === 'DELETE' && subParts[0] === 'records' && subParts[1]) {
      const id = subParts[1];
      let records = loadRecords();
      const before = records.length;
      records = records.filter((r) => r.id !== id);
      if (records.length === before) {
        helpers.sendJson(res, 404, { error: 'record not found' });
        return true;
      }
      applyAndReload(records);
      helpers.sendJson(res, 200, { deleted: true });
      return true;
    }

    if (method === 'GET' && subPath === '/settings') {
      helpers.sendJson(res, 200, loadSettings());
      return true;
    }

    if (method === 'PUT' && subPath === '/settings') {
      const body = await helpers.readBody(req);
      const settings = loadSettings();
      if (body.upstream1 !== undefined) settings.upstream1 = body.upstream1;
      if (body.upstream2 !== undefined) settings.upstream2 = body.upstream2;
      if (body.localDomain !== undefined) settings.localDomain = body.localDomain;
      if (body.logQueries !== undefined) settings.logQueries = Boolean(body.logQueries);
      saveSettings(settings);
      restartDnsmasq(loadRecords(), settings);
      helpers.sendJson(res, 200, settings);
      return true;
    }

    return false;
  },
};

module.exports = dnsmasqModule;
