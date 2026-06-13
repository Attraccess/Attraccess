import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MONITORING_ROOT = join(__dirname, '..', '..', '..', '..', 'monitoring');
const METRICS_ROOT = join(__dirname);
const DASHBOARDS_DIR = join(MONITORING_ROOT, 'grafana', 'dashboards');
const PROMETHEUS_DATASOURCE_UID = 'attraccess-prometheus';

// The new admin-focused dashboard set (ATT-517): one System Health landing board
// plus focused drill-downs, all linked together via the "Attraccess Dashboards"
// dropdown. The old chaotic per-subsystem boards were removed.
const DASHBOARD_FILES = [
  'attraccess-system-health.json',
  'attraccess-api.json',
  'attraccess-devices.json',
  'attraccess-realtime.json',
  'attraccess-jobs.json',
  'attraccess-integrations.json',
  'attraccess-usage.json',
  'node-runtime.json',
];

function loadYaml(relativePath: string): string {
  return readFileSync(join(MONITORING_ROOT, relativePath), 'utf-8');
}

function expectAlertNoDataState(rulesYaml: string, title: string, noDataState: 'NoData' | 'OK'): void {
  const block = rulesYaml.match(new RegExp(`title: ${title}[\\s\\S]*?(?=\\n\\s+- uid:|\\n\\s*$)`))?.[0];
  expect(block).toBeDefined();
  expect(block).toContain(`noDataState: ${noDataState}`);
}

function collectMetricNames(): Set<string> {
  const names = new Set<string>();
  const definitionsDir = join(METRICS_ROOT, 'definitions');
  const candidates: string[] = [
    join(METRICS_ROOT, 'metrics.service.ts'),
    ...readdirSync(definitionsDir)
      .filter((f) => f.endsWith('.metrics.ts'))
      .map((f) => join(definitionsDir, f)),
  ];
  for (const file of candidates) {
    const src = readFileSync(file, 'utf-8');
    const re = /name:\s*["'](attraccess_[a-z0-9_]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      names.add(m[1]);
    }
  }
  return names;
}

function extractMetricRefs(expr: string): string[] {
  const re = /\battraccess_[a-z0-9_]+\b/g;
  return expr.match(re) ?? [];
}

function stripHistogramSuffix(name: string): string {
  if (name.endsWith('_bucket')) return name.slice(0, -'_bucket'.length);
  if (name.endsWith('_count')) return name.slice(0, -'_count'.length);
  if (name.endsWith('_sum')) return name.slice(0, -'_sum'.length);
  return name;
}

interface DashboardTarget {
  expr?: string;
  refId?: string;
}

interface DashboardPanel {
  title?: string;
  type?: string;
  datasource?: { uid?: string };
  gridPos?: { h?: number; w?: number; x?: number; y?: number };
  targets?: DashboardTarget[];
}

interface Dashboard {
  title?: string;
  uid?: string;
  description?: string;
  tags?: string[];
  links?: unknown[];
  schemaVersion?: number;
  panels?: DashboardPanel[];
}

function loadDashboard(file: string): Dashboard {
  return JSON.parse(readFileSync(join(DASHBOARDS_DIR, file), 'utf-8'));
}

function collectPanelExprs(dashboard: Dashboard): string[] {
  const exprs: string[] = [];
  for (const panel of dashboard.panels ?? []) {
    for (const target of panel.targets ?? []) {
      if (target.expr) exprs.push(target.expr);
    }
  }
  return exprs;
}

describe('Monitoring configuration consistency', () => {
  const dashboards = DASHBOARD_FILES.map((file) => ({ file, json: loadDashboard(file) }));
  const knownMetrics = collectMetricNames();

  describe('dashboard set structure (ATT-517)', () => {
    it('every dashboard parses as valid JSON with the required top-level fields', () => {
      for (const { file, json } of dashboards) {
        expect(typeof json.title).toBe('string');
        expect((json.title ?? '').length).toBeGreaterThan(0);
        expect(typeof json.uid).toBe('string');
        expect((json.uid ?? '').length).toBeGreaterThan(0);
        expect(typeof json.description).toBe('string');
        expect((json.description ?? '').length).toBeGreaterThan(0);
        expect(Array.isArray(json.tags)).toBe(true);
        expect(json.tags).toContain('attraccess');
        expect(Array.isArray(json.panels)).toBe(true);
        expect((json.panels ?? []).length).toBeGreaterThan(0);
        expect(json.schemaVersion).toBeGreaterThan(0);
        expect(file).toBeDefined();
      }
    });

    it('every dashboard uses a unique UID', () => {
      const uids = dashboards.map((d) => d.json.uid);
      expect(new Set(uids).size).toBe(uids.length);
    });

    it('every dashboard links to the other Attraccess dashboards (cross-navigation)', () => {
      for (const { file, json } of dashboards) {
        const linksText = JSON.stringify(json.links ?? []);
        expect(linksText).toContain('attraccess');
        expect(file).toBeDefined();
      }
    });
  });

  describe('Grafana datasource UID consistency', () => {
    it('datasource provisioning has the stable UID', () => {
      const datasourceConfig = loadYaml('grafana/provisioning/datasources/prometheus.yml');
      expect(datasourceConfig).toContain(`uid: ${PROMETHEUS_DATASOURCE_UID}`);
    });

    it('every panel references the prometheus datasource UID', () => {
      for (const { file, json } of dashboards) {
        for (const panel of json.panels ?? []) {
          if (panel.type === 'row') continue;
          expect(panel.datasource).toBeDefined();
          expect(panel.datasource?.uid).toBe(PROMETHEUS_DATASOURCE_UID);
          expect(file).toBeDefined();
        }
      }
    });
  });

  describe('dashboard query correctness', () => {
    it('no panel references an unprefixed http_requests_total / http_request_duration_seconds', () => {
      for (const { file, json } of dashboards) {
        const text = JSON.stringify(json);
        expect(text.match(/[^_]http_requests_total/g)).toBeNull();
        expect(text.match(/[^_]http_request_duration_seconds/g)).toBeNull();
        expect(file).toBeDefined();
      }
    });

    it('every metric referenced in a panel target exists in the metrics module', () => {
      const unknown: string[] = [];
      for (const { file, json } of dashboards) {
        for (const expr of collectPanelExprs(json)) {
          for (const ref of extractMetricRefs(expr)) {
            const base = stripHistogramSuffix(ref);
            if (!knownMetrics.has(base)) {
              unknown.push(`${file}: ${ref} (base ${base})`);
            }
          }
        }
      }
      expect(unknown).toEqual([]);
    });

    it('every panel target has a non-empty expr', () => {
      for (const { file, json } of dashboards) {
        for (const panel of json.panels ?? []) {
          for (const target of panel.targets ?? []) {
            expect(typeof target.expr).toBe('string');
            expect((target.expr ?? '').trim().length).toBeGreaterThan(0);
            expect(file).toBeDefined();
          }
        }
      }
    });
  });

  describe('System Health landing dashboard', () => {
    const health = dashboards.find((d) => d.file === 'attraccess-system-health.json');

    it('exists and surfaces the core health signals', () => {
      expect(health).toBeDefined();
      const text = collectPanelExprs(health?.json ?? {}).join('\n');
      const signals = [
        'up{job=',
        'attraccess_http_requests_total',
        'attraccess_http_request_duration_seconds',
        'attraccess_attractap_devices_connected',
        'attraccess_cron_job_runs_total',
        'attraccess_resource_maintenance_overdue',
        'nodejs_eventloop_lag_seconds',
      ];
      for (const signal of signals) {
        expect(text).toContain(signal);
      }
    });
  });

  describe('per-subsystem drill-down coverage', () => {
    it('exposes a dashboard for every major subsystem metric family', () => {
      const allText = JSON.stringify(dashboards.map((d) => d.json));
      const families = [
        'attraccess_http_request_duration_seconds',
        'attraccess_ws_message_duration_seconds',
        'attraccess_sse_active_connections',
        'attraccess_cron_job_duration_seconds',
        'attraccess_flow_execution_duration_seconds',
        'attraccess_db_query_duration_seconds',
        'attraccess_external_call_duration_seconds',
        'attraccess_attractap_crash_reports_total',
        'attraccess_billing_transactions_total',
      ];
      for (const family of families) {
        expect(allText).toContain(family);
      }
    });
  });

  describe('alerting rules', () => {
    // Alerting is provisioned via Grafana, not Prometheus rule_files. The legacy
    // monitoring/prometheus/alerts.yml was removed (ATT-527) to avoid duplicate rules.
    const grafanaRules = loadYaml('grafana/provisioning/alerting/rules.yaml');

    const requiredAlerts = [
      // pre-existing
      'AttractapServiceDown',
      'HighHttpErrorRate',
      'HighRequestLatency',
      'HighFailedLoginRate',
      'HighSsoLoginFailureRate',
      'OverdueMaintenance',
      // ATT-517 device + system health additions
      'AttractapAllReadersOffline',
      'AttractapReaderCrashes',
      'CronJobFailing',
      'CronJobStale',
      'FlowExecutionFailures',
      'ExternalCallErrors',
      'MqttServersUnhealthy',
      'EmailDeliveryFailures',
      'HighEventLoopLag',
      'HighHostMemoryUsage',
      'HighHostDiskUsage',
      'HighAttraccessContainerMemoryUsage',
    ];

    it('Grafana provisioned rules define all required alerts', () => {
      expect(grafanaRules).toContain('groups:');
      for (const alert of requiredAlerts) {
        expect(grafanaRules).toContain(alert);
      }
    });

    it('only availability checks alert on missing data', () => {
      const availabilityAlerts = ['AttractapServiceDown', 'ScrapeFailures'];
      const metricValueAlerts = requiredAlerts.filter((alert) => !availabilityAlerts.includes(alert));

      for (const alert of availabilityAlerts) {
        expectAlertNoDataState(grafanaRules, alert, 'NoData');
      }

      for (const alert of metricValueAlerts) {
        expectAlertNoDataState(grafanaRules, alert, 'OK');
      }
    });

    it('prometheus.yml is generated by config-ui', () => {
      const config = loadYaml('prometheus/prometheus.yml');
      expect(config).toContain('config-ui');
    });
  });
});
