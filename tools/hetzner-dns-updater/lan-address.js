'use strict';

const { log } = require('./hetzner-settings.js');

function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

function expandEnvRefs(input) {
  if (typeof input !== 'string') return '';
  // Replace ${VAR} first
  let out = input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, v) => {
    const val = process.env[v];
    return val == null ? '' : String(val);
  });
  // Replace $VAR (avoid $$ and already replaced forms)
  out = out.replace(/\$(?!\$)([A-Za-z_][A-Za-z0-9_]*)/g, (_, v) => {
    const val = process.env[v];
    return val == null ? '' : String(val);
  });
  return out;
}

function pickLanIPv4() {
  const forcedRaw = process.env.HETZNER_FORCE_IP || '';
  if (forcedRaw.trim() !== '') {
    const resolved = expandEnvRefs(forcedRaw.trim());
    if (resolved.includes('$') || resolved.includes('{') || resolved.includes('}')) {
      log('HETZNER_FORCE_IP appears unresolved; ignoring');
    } else if (isValidIPv4(resolved)) {
      return resolved;
    } else {
      log(`HETZNER_FORCE_IP is not a valid IPv4 (${resolved}); ignoring`);
    }
  }

  const os = require('os');
  const nets = os.networkInterfaces();
  for (const [, addrs] of Object.entries(nets)) {
    if (!Array.isArray(addrs)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        if (typeof addr.address === 'string' && addr.address.startsWith('169.254.')) continue;
        if (isValidIPv4(addr.address)) return addr.address;
      }
    }
  }
  return '';
}
module.exports = { isValidIPv4, expandEnvRefs, pickLanIPv4 };
