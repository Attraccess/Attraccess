'use strict';
const fs = require('fs');
const path = require('path');

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
  return (
    records
      .filter((r) => r.hostname && r.ip)
      .map((r) => `${r.ip} ${r.hostname}`)
      .join('\n') + '\n'
  );
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
module.exports = {
  DATA_DIR,
  RECORDS_FILE,
  SETTINGS_FILE,
  DNSMASQ_CONF_DIR,
  DNSMASQ_CONF_FILE,
  DNSMASQ_HOSTS_FILE,
  LISTEN_ADDRESS,
  log,
  loadJson,
  saveJson,
  loadRecords,
  saveRecords,
  loadSettings,
  saveSettings,
  generateDnsmasqConfig,
  generateHostsFile,
  writeDnsmasqConfig,
};

function getEnvBoolean(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
module.exports.getEnvBoolean = getEnvBoolean;
