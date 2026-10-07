'use strict';
const { getEnvBoolean } = require('./dnsmasq-config');
const { loadRecords, loadSettings, saveSettings, log, writeDnsmasqConfig } = require('./dnsmasq-config.js');
const { applyAndReload, restartDnsmasq, startDnsmasq, stopDnsmasq, getDnsmasqStatus } = require('./dnsmasq-process.js');

const crypto = require('crypto');
const HOSTNAME_PATTERN =
  /^(\*\.)?(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
const IPV6_PATTERN = /^[0-9a-fA-F:]+$/;

function isValidHostname(value) {
  return typeof value === 'string' && HOSTNAME_PATTERN.test(value);
}

function isValidIp(value) {
  if (typeof value !== 'string') return false;
  if (IPV4_PATTERN.test(value)) return true;
  return IPV6_PATTERN.test(value) && value.includes(':');
}

// ponytail: fixed 5s retry, no backoff. The boot failure is transient — at reboot
// the LAN interface (listen-address + bind-interfaces) or port 53 isn't free yet,
// which clears within seconds. Add backoff if a permanent misconfig spams the log.

async function createRecord(req, res, helpers) {
  const body = await helpers.readBody(req);
  if (!body.hostname || !body.ip) {
    helpers.sendJson(res, 400, { error: 'hostname and ip required' });
    return true;
  }
  if (!isValidHostname(body.hostname) || !isValidIp(body.ip)) {
    helpers.sendJson(res, 400, { error: 'invalid hostname or ip' });
    return true;
  }
  const records = loadRecords();
  const newRecord = { id: crypto.randomUUID(), hostname: body.hostname, ip: body.ip };
  records.push(newRecord);
  applyAndReload(records);
  helpers.sendJson(res, 201, newRecord);
  return true;
}

async function updateRecord(subParts, req, res, helpers) {
  const id = subParts[1];
  const body = await helpers.readBody(req);
  const records = loadRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) {
    helpers.sendJson(res, 404, { error: 'record not found' });
    return true;
  }
  if (body.hostname !== undefined && !isValidHostname(body.hostname)) {
    helpers.sendJson(res, 400, { error: 'invalid hostname' });
    return true;
  }
  if (body.ip !== undefined && !isValidIp(body.ip)) {
    helpers.sendJson(res, 400, { error: 'invalid ip' });
    return true;
  }
  if (body.hostname) records[idx].hostname = body.hostname;
  if (body.ip) records[idx].ip = body.ip;
  applyAndReload(records);
  helpers.sendJson(res, 200, records[idx]);
  return true;
}

async function deleteRecord(subParts, res, helpers) {
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

async function updateSettings(req, res, helpers) {
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
    stopDnsmasq();
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
      return createRecord(req, res, helpers);
    }

    if (method === 'PUT' && subParts[0] === 'records' && subParts[1]) {
      return updateRecord(subParts, req, res, helpers);
    }

    if (method === 'DELETE' && subParts[0] === 'records' && subParts[1]) {
      return deleteRecord(subParts, res, helpers);
    }

    if (method === 'GET' && subPath === '/settings') {
      helpers.sendJson(res, 200, loadSettings());
      return true;
    }

    if (method === 'PUT' && subPath === '/settings') {
      return updateSettings(req, res, helpers);
    }

    return false;
  },
};

module.exports = dnsmasqModule;
