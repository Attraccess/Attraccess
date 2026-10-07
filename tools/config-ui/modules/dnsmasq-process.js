'use strict';
const fs = require('fs');
const { spawn } = require('child_process');
const { log, DNSMASQ_HOSTS_FILE, generateHostsFile, writeDnsmasqConfig, saveRecords } = require('./dnsmasq-config.js');

let dnsmasqProcess = null;

let restartTimer = null;

let stopped = false;

const RESTART_DELAY_MS = Number(process.env.DNS_RESTART_DELAY_MS) || 5000;

// ponytail: fixed 5s retry, no backoff. The boot failure is transient — at reboot
// the LAN interface (listen-address + bind-interfaces) or port 53 isn't free yet,
// which clears within seconds. Add backoff if a permanent misconfig spams the log.
function scheduleRestart() {
  if (stopped || restartTimer) return;
  restartTimer = setTimeout(() => {
    restartTimer = null;
    log('retrying start');
    startDnsmasq();
  }, RESTART_DELAY_MS);
  if (restartTimer.unref) restartTimer.unref();
}

function startDnsmasq() {
  if (dnsmasqProcess) return;
  stopped = false;
  try {
    // ,*.conf restricts conf-dir to *.conf files so the addn-hosts file
    // (/etc/dnsmasq.d/custom-hosts) is NOT parsed as a config file. Without it
    // dnsmasq dies with "bad option at line 1 of .../custom-hosts".
    const proc = spawn('dnsmasq', ['--no-daemon', '--conf-dir=/etc/dnsmasq.d/,*.conf'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    dnsmasqProcess = proc;
    // spawn reports a failed exec (ENOENT, EAGAIN under memory pressure at boot)
    // as an async error event, not a throw — and an unhandled one kills config-ui.
    // Attach before touching proc.stdout: on EMFILE/ENFILE the stdio streams are
    // never created, so wiring them throws and would leave 'error' unhandled.
    // Events from a superseded proc are ignored so a process killed by a restart
    // can't clear the live reference and respawn a second dnsmasq.
    proc.on('error', (err) => {
      log(`failed to start: ${err.message}`);
      if (dnsmasqProcess !== proc) return;
      dnsmasqProcess = null;
      scheduleRestart();
    });
    proc.on('exit', (code) => {
      log(`exited with code ${code}`);
      if (dnsmasqProcess !== proc) return;
      dnsmasqProcess = null;
      scheduleRestart();
    });
    proc.stdout.on('data', (data) => log(`${data.toString().trim()}`));
    proc.stderr.on('data', (data) => log(`${data.toString().trim()}`));
    log(`started (pid ${proc.pid})`);
  } catch (err) {
    // Malformed args/options, or EMFILE/ENFILE leaving proc.stdout undefined.
    log(`failed to start: ${err.message}`);
    dnsmasqProcess = null;
    scheduleRestart();
  }
}

function stopDnsmasq() {
  stopped = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (dnsmasqProcess) {
    dnsmasqProcess.kill('SIGTERM');
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
  stopDnsmasq();
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
module.exports = {
  RESTART_DELAY_MS,
  scheduleRestart,
  startDnsmasq,
  stopDnsmasq,
  reloadDnsmasq,
  writeHostsAndReload,
  restartDnsmasq,
  applyAndReload,
  getDnsmasqStatus,
};
