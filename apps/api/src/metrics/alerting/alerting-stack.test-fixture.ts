import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { createServer, IncomingMessage, Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { GenericContainer, Network, StartedNetwork, StartedTestContainer, Wait } from 'testcontainers';
import { AttractapCrashReport } from '@attraccess/database-entities';
import { MetricsService } from '../metrics.service';
import { ResetReportMetricsCollector } from '../reset-report-metrics.collector';

const MONITORING = join(__dirname, '..', '..', '..', '..', '..', 'monitoring');
const PROVISIONING = join(MONITORING, 'grafana', 'provisioning');

// Generous so a busy CI runner or workstation does not fail container start-up.
// ALERTING_STARTUP_TIMEOUT_MS raises it further on a heavily loaded host (Grafana migrates its database on start).
const STARTUP_TIMEOUT_MS = Number(process.env['ALERTING_STARTUP_TIMEOUT_MS'] ?? 300_000);

// Same images as the Coolify stack, so the test follows its upgrades.
const COMPOSE = readFileSync(join(MONITORING, '..', 'coolify.docker-compose.yml'), 'utf-8');
function composeImage(name: string): string {
  const image = COMPOSE.match(new RegExp(`image: (${name}:\\S+)`))?.[1];
  if (!image) throw new Error(`coolify.docker-compose.yml has no ${name} image`);
  return image;
}

export const PROMETHEUS_IMAGE = composeImage('prom/prometheus');
export const GRAFANA_IMAGE = process.env['ALERTING_GRAFANA_VERSION']
  ? `grafana/grafana:${process.env['ALERTING_GRAFANA_VERSION']}`
  : composeImage('grafana/grafana');
export const SHIPPED_RULES = readFileSync(join(PROVISIONING, 'alerting', 'rules.yaml'), 'utf-8');
const TEMPLATES = readFileSync(join(PROVISIONING, 'alerting', 'templates.yaml'), 'utf-8');

/** The shipped rules with only the evaluation interval and pending period shortened. */
export function scaledRules(rules: string, pending: string, interval: string): string {
  if (!/^ {4}interval: 1m$/m.test(rules) || !/^ {8}for: 5m$/m.test(rules)) {
    throw new Error('rules.yaml layout changed: cannot find "interval: 1m" / "for: 5m" to shorten');
  }
  return rules
    .replace(/^ {4}interval: 1m$/m, `    interval: ${interval}`)
    .replace(/^ {8}for: 5m$/gm, `        for: ${pending}`);
}

export interface Notification {
  status: string;
  title: string;
  message: string;
  alertname: string;
}

interface Rule {
  name: string;
  alerts?: Array<{ state: string; activeAt: string; annotations: { description: string } }>;
}
type Rules = { data?: { groups: Array<{ rules: Rule[] }> } };

export interface AlertInstance {
  state: string;
  activeAt: string;
  description: string;
}

/** A metrics endpoint served by the real MetricsService and collector over a shared SQLite file. */
class MetricsServer {
  private constructor(
    readonly port: number,
    private readonly server: Server,
    private readonly source: DataSource,
  ) {}

  static async start(file: string): Promise<MetricsServer> {
    const source = await new DataSource({ type: 'sqlite', database: file, busyTimeout: 5000 }).initialize();
    const service = new MetricsService(...(Array(7).fill({}) as ConstructorParameters<typeof MetricsService>));
    const collector = new ResetReportMetricsCollector(service, source.getRepository(AttractapCrashReport));
    collector.onModuleInit();
    const server = createServer((req, res) => {
      service
        .getMetrics()
        .then((body) => res.writeHead(200, { 'Content-Type': service.getContentType() }).end(body))
        .catch((err: Error) => res.writeHead(500).end(err.message));
    });
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    return new MetricsServer(typeof address === 'object' && address ? address.port : 0, server, source);
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server.close(resolve));
    await this.source.destroy();
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

function parseNotification(body: string): Notification {
  try {
    const payload = JSON.parse(body) as Omit<Notification, 'alertname'> & { commonLabels?: { alertname?: string } };
    return { ...payload, alertname: payload.commonLabels?.alertname ?? 'unparsed' };
  } catch {
    return { status: 'unparsed', title: '', message: body, alertname: 'unparsed' };
  }
}

export class AlertingStack {
  readonly notifications: Notification[] = [];
  private dir = '';
  private db!: DataSource;
  private servers: MetricsServer[] = [];
  private webhook!: Server;
  private network!: StartedNetwork;
  private prometheus!: StartedTestContainer;
  private grafana!: StartedTestContainer;
  private nextId = 1;

  static async start(rules: string): Promise<AlertingStack> {
    const stack = new AlertingStack();
    try {
      await stack.boot(rules);
    } catch (error) {
      await stack.stop().catch(() => undefined);
      throw error;
    }
    return stack;
  }

  private async boot(rules: string): Promise<void> {
    this.dir = mkdtempSync(join(tmpdir(), 'attraccess-alerting-'));
    const file = join(this.dir, 'attraccess.sqlite');
    this.db = await new DataSource({ type: 'sqlite', database: file, busyTimeout: 5000 }).initialize();
    await this.createSchema();
    // Push each server as it starts, so a failed second start still stops the first.
    this.servers.push(await MetricsServer.start(file));
    this.servers.push(await MetricsServer.start(file));
    const webhookPort = await this.startWebhook();
    this.network = await new Network().start();
    this.prometheus = await this.startPrometheus();
    this.grafana = await this.startGrafana(rules, webhookPort);
  }

  private async createSchema(): Promise<void> {
    await this.db.query(`CREATE TABLE attractap (id integer PRIMARY KEY, name text NOT NULL)`);
    await this.db.query(`CREATE TABLE attractap_crash_report (
      id integer PRIMARY KEY, attractapId integer NOT NULL, resetReason text NOT NULL,
      createdAt datetime NOT NULL DEFAULT (datetime('now')))`);
    await this.db.query(
      `CREATE INDEX "IDX_attractap_crash_report_created_at" ON "attractap_crash_report" ("createdAt")`,
    );
    await this.db.query(`INSERT INTO attractap VALUES (1, 'Door'), (2, 'Laser'), (3, 'Gate')`);
  }

  private async startWebhook(): Promise<number> {
    this.webhook = createServer((req, res) => {
      void readBody(req).then((body) => {
        // Ignore empty probes only. Anything else is recorded, even if it cannot be parsed, so a malformed
        // notification fails the "stays quiet" checks instead of disappearing.
        if (body.trim()) this.notifications.push(parseNotification(body));
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((resolve) => this.webhook.listen(0, '0.0.0.0', resolve));
    return (this.webhook.address() as { port: number }).port;
  }

  private async startPrometheus(): Promise<StartedTestContainer> {
    const targets = this.servers.map((s) => `'host.docker.internal:${s.port}'`).join(', ');
    const config = `global:
  scrape_interval: 5s
scrape_configs:
  - job_name: attraccess
    metrics_path: /api/metrics
    static_configs:
      - targets: [${targets}]
`;
    return new GenericContainer(PROMETHEUS_IMAGE)
      .withNetwork(this.network)
      .withNetworkAliases('prometheus')
      .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
      .withCopyContentToContainer([{ content: config, target: '/etc/prometheus/prometheus.yml' }])
      .withExposedPorts(9090)
      .withWaitStrategy(Wait.forHttp('/-/ready', 9090).withStartupTimeout(STARTUP_TIMEOUT_MS))
      .start();
  }

  private async startGrafana(rules: string, webhookPort: number): Promise<StartedTestContainer> {
    const datasource = readFileSync(join(PROVISIONING, 'datasources', 'prometheus.yml'), 'utf-8');
    const contactPoints = `apiVersion: 1
contactPoints:
  - orgId: 1
    name: Capture
    receivers:
      - uid: capture
        type: webhook
        settings:
          url: http://host.docker.internal:${webhookPort}/
          title: '{{ template "attraccess.pushover.title" . }}'
          message: '{{ template "attraccess.pushover.message" . }}'
`;
    const policies = `apiVersion: 1
policies:
  - orgId: 1
    receiver: Capture
    group_by: [grafana_folder, alertname]
    group_wait: 0s
    group_interval: 10s
    repeat_interval: 4h
`;
    const at = (name: string) => `/etc/grafana/provisioning/${name}`;
    // Grafana's SQLite migrations fsync hundreds of times; on a slow Docker disk start-up took over 7 minutes
    // versus about 30 seconds in memory. The test needs no persistence, so /var/lib/grafana lives in tmpfs.
    // It must be mounted exec: Grafana 13.2 installs data source plugins there and fails to start them on noexec.
    return new GenericContainer(GRAFANA_IMAGE)
      .withNetwork(this.network)
      .withTmpFs({ '/var/lib/grafana': 'rw,exec,mode=1777' })
      .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
      .withEnvironment({
        GF_AUTH_ANONYMOUS_ENABLED: 'true',
        GF_AUTH_ANONYMOUS_ORG_ROLE: 'Viewer',
        GF_ALERTING_SCHEDULER_TICK_INTERVAL: '1s',
      })
      .withCopyContentToContainer([
        { content: datasource, target: at('datasources/prometheus.yml') },
        { content: rules, target: at('alerting/rules.yaml') },
        { content: TEMPLATES, target: at('alerting/templates.yaml') },
        { content: contactPoints, target: at('alerting/contactpoints.yaml') },
        { content: policies, target: at('alerting/policies.yaml') },
      ])
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp('/api/health', 3000).withStartupTimeout(STARTUP_TIMEOUT_MS))
      .start();
  }

  /** Replaces all stored reports in one transaction, so a scrape never sees a half-written set. */
  async setReports(reports: Array<{ reader: number; reason: string }>): Promise<void> {
    await this.db.transaction(async (manager) => {
      await manager.query('DELETE FROM attractap_crash_report');
      for (const { reader, reason } of reports) {
        await manager.query(
          `INSERT INTO attractap_crash_report (id, attractapId, resetReason, createdAt) VALUES (?, ?, ?, datetime('now'))`,
          [this.nextId++, reader, reason],
        );
      }
    });
  }

  /** Makes every count query fail, as a broken database would; both metrics servers then answer 500. */
  async breakDatabase(): Promise<void> {
    await this.db.query('ALTER TABLE attractap_crash_report RENAME TO attractap_crash_report_broken');
  }

  /** Value of a single-series PromQL instant query, or undefined when it returns no series. */
  async query(promql: string): Promise<number | undefined> {
    const url = `http://${this.prometheus.getHost()}:${this.prometheus.getMappedPort(9090)}/api/v1/query?query=${encodeURIComponent(promql)}`;
    const body = (await (await fetch(url)).json()) as { data: { result: Array<{ value: [number, string] }> } };
    const value = body.data.result[0]?.value[1];
    return value === undefined ? undefined : Number(value);
  }

  /** Number of scrape targets Prometheus currently reaches; both metrics servers must be up for the max() check. */
  async targetsUp(): Promise<number> {
    return (await this.query('count(up{job="attraccess"} == 1)')) ?? 0;
  }

  /**
   * Under load Grafana can drop the connection, answer 5xx, or answer without the provisioned rules while it
   * reloads or its database is busy; retry so a poll never reads that as "no alert instance".
   */
  private async rule(alertname: string): Promise<Rule> {
    const url = `http://${this.grafana.getHost()}:${this.grafana.getMappedPort(3000)}/api/prometheus/grafana/api/v1/rules`;
    // Up to a minute: on a loaded host Grafana has stalled for over 16 seconds.
    for (let attempt = 0; attempt < 30; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
      const body = (await fetch(url)
        .then((res) => res.json())
        .catch(() => ({}))) as Rules;
      const rule = body.data?.groups.flatMap((g) => g.rules).find((r) => r.name === alertname);
      if (rule) return rule;
    }
    throw new Error(`Grafana did not return the alert rule ${alertname}`);
  }

  async instances(alertname: string): Promise<AlertInstance[]> {
    const rule = await this.rule(alertname);
    return (rule.alerts ?? []).map((a) => ({
      state: a.state.replace(/ \(.*\)$/, ''),
      activeAt: a.activeAt,
      description: a.annotations.description,
    }));
  }

  /** Runs every cleanup step even if an earlier one fails, so open sockets never keep Jest alive. */
  async stop(): Promise<void> {
    await Promise.allSettled([this.grafana?.stop(), this.prometheus?.stop()]);
    await Promise.allSettled([
      this.network?.stop(),
      ...this.servers.map((s) => s.stop()),
      this.webhook && new Promise((resolve) => this.webhook.close(resolve)),
      this.db?.destroy(),
    ]);
    if (this.dir) rmSync(this.dir, { recursive: true, force: true });
  }
}
