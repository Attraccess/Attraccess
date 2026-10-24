// Real Grafana evaluations: deliberately takes at least five continuous minutes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { parse, stringify } from 'yaml';

const execFileAsync = promisify(execFile);

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = resolve(root, 'monitoring/grafana/provisioning');
const temp = await mkdtemp(join(tmpdir(), 'attractap-reset-alerts-'));
const evidence = resolve(process.env.RESET_ALERT_EVIDENCE_DIR ?? temp + '-evidence');
await mkdir(evidence, { recursive: true });
const project = `reset-alerts-${process.pid}-${Date.now()}`;
const session = project;
const env = { ...process.env, RESET_ALERT_TEST_DIR: temp };
let browserStarted = false;
let fixture = [];
const notifications = [];
const observations = [];
let preview;
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const server = createServer(async (req, res) => {
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.end(
      '# TYPE attraccess_attractap_reset_reports_last_hour gauge\n' +
        fixture
          .map(
            ([id, reason, count]) =>
              `attraccess_attractap_reset_reports_last_hour{reader_id="${id}",reset_reason="${reason}"} ${count}`,
          )
          .join('\n') +
        '\n',
    );
  } else if (req.url === '/notify' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    notifications.push(JSON.parse(body));
    res.end('{}');
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      `<html><title>Reset alert verification evidence</title><body style="font:16px system-ui;max-width:1100px;margin:32px"><h1>Local reset alert verification</h1><h2>Actual Grafana notification template preview</h2><pre style="white-space:pre-wrap">${escape(JSON.stringify(preview, null, 2))}</pre><h2>Observed states</h2><pre>${escape(JSON.stringify(observations, null, 2))}</pre></body></html>`,
    );
  }
});
const cancellation = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => cancellation.abort());
const delay = (ms) => sleep(ms, undefined, { signal: cancellation.signal });
function command(name, args, options = {}) {
  const result = spawnSync(name, args, { cwd: root, env, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${name} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function compose(...args) {
  return command('docker', [
    'compose',
    '-p',
    project,
    '-f',
    'monitoring/tests/attractap-reset-alerts.compose.yaml',
    ...args,
  ]);
}
async function save(name, value) {
  await writeFile(join(evidence, name), JSON.stringify(value, null, 2));
}
async function until(label, check, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(3000);
  }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  command('docker', ['info', '--format', '{{.ServerVersion}}']);
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const fixturePort = server.address().port;
  for (const dir of ['alerting', 'datasources']) await mkdir(join(temp, 'provisioning', dir), { recursive: true });
  const allRules = parse(await readFile(join(source, 'alerting/rules.yaml'), 'utf8'));
  const uids = ['attractap-reader-crashes', 'attractap-reader-poweron-resets'];
  const groups = allRules.groups
    .map((group) => ({ ...group, rules: group.rules.filter((rule) => uids.includes(rule.uid)) }))
    .filter((group) => group.rules.length);
  assert.equal(groups.flatMap((g) => g.rules).length, 2);
  for (const group of groups) {
    assert.equal(group.interval, '1m');
    for (const rule of group.rules) assert.equal(rule.for, '5m');
  }
  await writeFile(join(temp, 'provisioning/alerting/rules.yaml'), stringify({ apiVersion: 1, groups }));
  await writeFile(
    join(temp, 'provisioning/alerting/templates.yaml'),
    await readFile(join(source, 'alerting/templates.yaml')),
  );
  await writeFile(
    join(temp, 'provisioning/alerting/contacts.yaml'),
    stringify({
      apiVersion: 1,
      contactPoints: [
        {
          orgId: 1,
          name: 'local-only',
          receivers: [
            {
              uid: 'local-only',
              type: 'webhook',
              settings: { url: `http://host.docker.internal:${fixturePort}/notify` },
            },
          ],
        },
      ],
      policies: [
        {
          orgId: 1,
          receiver: 'local-only',
          group_by: ['alertname'],
          group_wait: '0s',
          group_interval: '1s',
          repeat_interval: '1h',
        },
      ],
    }),
  );
  await writeFile(
    join(temp, 'provisioning/datasources/prometheus.yaml'),
    stringify({
      apiVersion: 1,
      datasources: [
        {
          name: 'Prometheus',
          type: 'prometheus',
          uid: 'attraccess-prometheus',
          access: 'proxy',
          url: 'http://prometheus:9090',
          isDefault: true,
        },
      ],
    }),
  );
  await writeFile(
    join(temp, 'prometheus.yaml'),
    stringify({
      global: { scrape_interval: '2s' },
      scrape_configs: [
        {
          job_name: 'attraccess',
          static_configs: [
            { targets: [`host.docker.internal:${fixturePort}`], labels: { replica: 'first' } },
            { targets: [`host.docker.internal:${fixturePort}`], labels: { replica: 'second' } },
          ],
          metrics_path: '/metrics',
        },
      ],
    }),
  );
  compose('up', '-d');
  const grafana = `http://${compose('port', 'grafana', '3000')}`;
  const prometheus = `http://${compose('port', 'prometheus', '9090')}`;
  async function api(path, body) {
    const response = await fetch(grafana + path, {
      headers: {
        Authorization: `Basic ${Buffer.from('admin:local-reset-test').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    assert.ok(response.ok, `${path}: ${response.status} ${text}`);
    return JSON.parse(text);
  }
  await until('Grafana startup', () => api('/api/health').catch(() => false));
  await until('Prometheus startup', () =>
    fetch(prometheus + '/-/ready')
      .then((r) => r.ok)
      .catch(() => false),
  );
  process.stdout.write(`Local Grafana: ${grafana}; evidence: ${evidence}\n`);
  const rules = groups.flatMap((group) => group.rules);
  async function totals(expected) {
    for (let i = 0; i < rules.length; i++) {
      const expr = rules[i].data.find((d) => d.refId === 'A').model.expr;
      const response = await fetch(`${prometheus}/api/v1/query?query=${encodeURIComponent(expr)}`);
      const data = await response.json();
      if (Number(data.data?.result?.[0]?.value?.[1]) !== expected[i]) return false;
    }
    return true;
  }
  async function states() {
    const result = await api('/api/prometheus/grafana/api/v1/rules');
    const rows = result.data.groups.flatMap((g) => g.rules).filter((r) => rules.some((rule) => rule.title === r.name));
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.health, 'ok', JSON.stringify(row));
    return rows;
  }
  function stateIs(rows, state) {
    return rows.every((row) => row.state === state);
  }
  await until('empty category fallback equals zero', () => totals([0, 0]));
  fixture = [
    [5, 'POWERON', 2],
    [10, 'POWERON', 1],
    [5, 'PANIC', 2],
    [10, 'WDT', 1],
    [5, 'SW', 50],
    [10, 'UNKNOWN', 50],
  ];
  await until('exact three in each category', () => totals([3, 3]));
  fixture = [
    [5, 'POWERON', 3],
    [10, 'POWERON', 1],
    [5, 'PANIC', 2],
    [10, 'WDT', 1],
  ];
  await until('four POWERON does not raise crash total', () => totals([3, 4]));
  fixture = [
    [5, 'POWERON', 2],
    [10, 'POWERON', 1],
    [5, 'PANIC', 2],
    [10, 'INT_WDT', 1],
    [10, 'TASK_WDT', 1],
  ];
  await until('four crashes does not raise POWERON total', () => totals([4, 3]));
  fixture = [
    [5, 'POWERON', 2],
    [10, 'POWERON', 1],
    [5, 'PANIC', 2],
    [10, 'WDT', 1],
    [5, 'SW', 50],
    [10, 'UNKNOWN', 50],
  ];
  await until('three in each category restored', () => totals([3, 3]));
  // Wait for a real evaluation, rather than inspecting initial unevaluated state.
  await until('three reports remain normal after evaluation', async () => {
    const rows = await states();
    return (
      stateIs(rows, 'inactive') && rows.every((row) => row.alerts?.[0]?.annotations.description.includes('3 total'))
    );
  });
  fixture = [
    [5, 'POWERON', 3],
    [10, 'POWERON', 1],
    [5, 'PANIC', 2],
    [10, 'TASK_WDT', 2],
    [5, 'SW', 50],
  ];
  await until('four in each category', () => totals([4, 4]));
  const pending = await until('both categories pending', async () => {
    const rows = await states();
    return stateIs(rows, 'pending') && rows;
  });
  const activeAt = new Map(pending.map((r) => [r.name, r.alerts[0].activeAt]));
  observations.push({ at: new Date().toISOString(), state: 'pending', rows: pending });
  await save('pending.json', pending);
  // Change every contributor while keeping totals above three. No label may reset pending.
  fixture = [
    [20, 'POWERON', 1],
    [30, 'POWERON', 3],
    [20, 'INT_WDT', 1],
    [30, 'PANIC', 3],
  ];
  await until('new contributors scraped', () => totals([4, 4]));
  const firing = await until(
    'five continuous real minutes then firing',
    async () => {
      const rows = await states();
      for (const row of rows) {
        // Grafana's compatibility API reports the current state's start time,
        // so activeAt changes at Pending -> Firing even when the timer is stable.
        if (row.state === 'pending') {
          assert.equal(row.alerts[0]?.activeAt, activeAt.get(row.name), 'contributor changes reset pending');
        } else {
          assert.equal(row.state, 'firing', 'qualifying counts must stay pending or firing');
          const pendingSince = Date.parse(activeAt.get(row.name));
          const firingSince = Date.parse(row.alerts[0].activeAt);
          assert.equal(firingSince - pendingSince, 300_000, 'must fire at the first evaluation after five minutes');
          assert.ok(Date.now() >= firingSince);
        }
      }
      observations.push({
        at: new Date().toISOString(),
        states: rows.map((r) => ({ name: r.name, state: r.state, activeAt: r.alerts[0]?.activeAt })),
      });
      return stateIs(rows, 'firing') && rows;
    },
    420_000,
  );
  const alerts = firing.flatMap((row) => row.alerts);
  for (const alert of alerts) {
    const desc = alert.annotations.description;
    assert.ok(!desc.includes('{{'), desc);
    assert.match(desc, /4 total/);
    const power = alert.labels.alertname === 'AttractapReaderPowerOnResets';
    for (const [reader, reason, count] of power
      ? [
          [20, 'POWERON', 1],
          [30, 'POWERON', 3],
        ]
      : [
          [20, 'INT_WDT', 1],
          [30, 'PANIC', 3],
        ]) {
      assert.ok(desc.includes(`Reader ${reader}: ${reason}=${count}.`), desc);
    }
    if (power) assert.ok(desc.includes('do not establish a firmware crash or explain why power was cycled'), desc);
    assert.equal(alert.labels.reader_id, undefined);
    assert.equal(alert.labels.reset_reason, undefined);
  }
  await save('firing.json', firing);
  await until('local firing notifications', () =>
    uids.every((_, i) =>
      notifications.some((n) => n.alerts?.some((a) => a.labels.alertname === rules[i].title && a.status === 'firing')),
    ),
  );
  const templates = parse(await readFile(join(source, 'alerting/templates.yaml'), 'utf8')).templates;
  preview = await api('/api/alertmanager/grafana/config/api/v1/templates/test', {
    name: 'attraccess.pushover.message',
    template: templates.map((t) => t.template).join('\n'),
    alerts: alerts.map((a) => ({
      ...a,
      status: 'firing',
      startsAt: a.activeAt,
      endsAt: '0001-01-01T00:00:00Z',
      generatorURL: grafana + '/alerting/list',
    })),
  });
  assert.equal(preview.errors?.length ?? 0, 0, JSON.stringify(preview));
  for (const alert of alerts)
    assert.ok(JSON.stringify(preview).includes(alert.annotations.description), JSON.stringify(preview));
  await save('template-preview.json', preview);
  // Browser navigation calls back to our fixture server. Keep the event loop
  // running while the CLI waits for that HTTP response.
  const browser = (...args) =>
    execFileAsync('agent-browser', ['--session', session, ...args], { cwd: root, env, timeout: 30_000 });
  browserStarted = true;
  await browser(
    '--headed',
    'false',
    '--executable-path',
    process.env.BRAVE_EXECUTABLE ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    'open',
    grafana + '/alerting/list',
  );
  await browser('wait', '3000');
  await browser('screenshot', join(evidence, 'grafana-firing.png'));
  await browser('open', `http://127.0.0.1:${fixturePort}/evidence`);
  await browser('screenshot', join(evidence, 'notification-preview.png'));
  fixture = [
    [20, 'POWERON', 1],
    [30, 'POWERON', 2],
    [20, 'INT_WDT', 1],
    [30, 'PANIC', 2],
  ];
  await until('totals return to three', () => totals([3, 3]));
  const resolved = await until('firing warnings resolve at three', async () => {
    const rows = await states();
    return stateIs(rows, 'inactive') && rows;
  });
  await until('local resolved notifications', () =>
    rules.every((rule) =>
      notifications.some((n) => n.alerts?.some((a) => a.labels.alertname === rule.title && a.status === 'resolved')),
    ),
  );
  await save('resolved.json', resolved);
  await save('notifications.json', notifications);
  await save('observations.json', observations);
  process.stdout.write(
    `PASS: exact thresholds, stable five-minute pending, contributor annotations, shared template preview and resolution. Evidence: ${evidence}\n`,
  );
}
try {
  await main();
} finally {
  await save('observations.json', observations);
  await save('notifications.json', notifications);
  try {
    await writeFile(join(evidence, 'compose.log'), compose('logs', '--no-color'));
  } catch {
    /* startup may have failed */
  }
  if (browserStarted) {
    try {
      await execFileAsync('agent-browser', ['--session', session, 'close'], { cwd: root, env, timeout: 30_000 });
    } catch {
      /* preserve original failure */
    }
  }
  try {
    compose('down', '--volumes', '--remove-orphans');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
}
