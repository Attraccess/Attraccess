import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MONITORING_ROOT = join(__dirname, '..', '..', '..', '..', 'monitoring');
const METRICS_ROOT = join(__dirname);

function loadJson(relativePath: string) {
  return JSON.parse(readFileSync(join(MONITORING_ROOT, relativePath), 'utf-8'));
}

function loadYaml(relativePath: string) {
  return readFileSync(join(MONITORING_ROOT, relativePath), 'utf-8');
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
}

interface DashboardPanel {
  datasource?: { uid?: string };
  targets?: DashboardTarget[];
}

interface Dashboard {
  title?: string;
  uid?: string;
  description?: string;
  tags?: string[];
  panels?: DashboardPanel[];
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
  describe('issue #9: all dashboard queries use attraccess_ prefixed metric names', () => {
    const overviewDashboard = loadJson('grafana/dashboards/attraccess-overview.json');

    it('no panels reference unprefixed http_requests_total', () => {
      const json = JSON.stringify(overviewDashboard);
      const matches = json.match(/[^_]http_requests_total/g);
      expect(matches).toBeNull();
    });

    it('no panels reference unprefixed http_request_duration_seconds', () => {
      const json = JSON.stringify(overviewDashboard);
      const matches = json.match(/[^_]http_request_duration_seconds/g);
      expect(matches).toBeNull();
    });

    it('all custom metric references use attraccess_ prefix', () => {
      const allExprs: string[] = [];
      for (const panel of overviewDashboard.panels) {
        for (const target of panel.targets || []) {
          if (target.expr) allExprs.push(target.expr);
        }
      }

      for (const expr of allExprs) {
        const metricNames = expr.match(/\b[a-z][a-z0-9_]*(?:_total|_seconds|_bucket|_active|_connected|_overdue|_loaded|_healthy)\b/g) || [];
        for (const name of metricNames) {
          if (name.startsWith('le') || name.startsWith('job')) continue;
          expect(name).toMatch(/^attraccess_/);
        }
      }
    });
  });

  describe('issue #15: Grafana datasource UID consistency', () => {
    const datasourceConfig = loadYaml('grafana/provisioning/datasources/prometheus.yml');
    const overviewDashboard = loadJson('grafana/dashboards/attraccess-overview.json');
    const runtimeDashboard = loadJson('grafana/dashboards/node-runtime.json');

    it('datasource provisioning has a stable UID', () => {
      expect(datasourceConfig).toContain('uid: attraccess-prometheus');
    });

    it('overview dashboard panels reference the correct datasource UID', () => {
      for (const panel of overviewDashboard.panels) {
        expect(panel.datasource.uid).toBe('attraccess-prometheus');
      }
    });

    it('node runtime dashboard panels reference the correct datasource UID', () => {
      for (const panel of runtimeDashboard.panels) {
        expect(panel.datasource.uid).toBe('attraccess-prometheus');
      }
    });

    it('no panels have empty datasource UID', () => {
      const allPanels = [...overviewDashboard.panels, ...runtimeDashboard.panels];
      for (const panel of allPanels) {
        expect(panel.datasource.uid).not.toBe('');
      }
    });
  });

  describe('issue #13: alerting rules exist', () => {
    it('alerts.yml file exists and contains alerting rules', () => {
      const alerts = loadYaml('prometheus/alerts.yml');
      expect(alerts).toContain('groups:');
      expect(alerts).toContain('alert:');
    });

    it('includes a service-down alert', () => {
      const alerts = loadYaml('prometheus/alerts.yml');
      expect(alerts).toContain('AttractapServiceDown');
    });

    it('includes a high-error-rate alert', () => {
      const alerts = loadYaml('prometheus/alerts.yml');
      expect(alerts).toContain('HighHttpErrorRate');
    });

    it('includes a high-latency alert', () => {
      const alerts = loadYaml('prometheus/alerts.yml');
      expect(alerts).toContain('HighRequestLatency');
    });

    it('includes a failed-login alert', () => {
      const alerts = loadYaml('prometheus/alerts.yml');
      expect(alerts).toContain('HighFailedLoginRate');
    });

    it('includes an overdue-maintenance alert', () => {
      const alerts = loadYaml('prometheus/alerts.yml');
      expect(alerts).toContain('OverdueMaintenance');
    });
  });

  describe('issue #12: prometheus.yml references rule_files', () => {
    it('static prometheus.yml mentions config-ui generates the actual config', () => {
      const config = loadYaml('prometheus/prometheus.yml');
      expect(config).toContain('config-ui');
    });
  });

  describe('ATT-276: per-subsystem performance dashboards', () => {
    const dashboardFiles = [
      'grafana/dashboards/attraccess-performance-overview.json',
      'grafana/dashboards/attraccess-http.json',
      'grafana/dashboards/attraccess-websocket.json',
      'grafana/dashboards/attraccess-cron.json',
      'grafana/dashboards/attraccess-database.json',
    ];

    const dashboards = dashboardFiles.map((path) => ({ path, json: loadJson(path) }));
    const knownMetrics = collectMetricNames();

    it('every dashboard parses as valid JSON with required top-level fields', () => {
      for (const { path, json } of dashboards) {
        expect(json).toBeDefined();
        expect(typeof json.title).toBe('string');
        expect(typeof json.uid).toBe('string');
        expect(json.uid.length).toBeGreaterThan(0);
        expect(Array.isArray(json.tags)).toBe(true);
        expect(json.tags).toContain('attraccess');
        expect(Array.isArray(json.panels)).toBe(true);
        expect(json.panels.length).toBeGreaterThan(0);
        expect(typeof json.description).toBe('string');
        expect(json.description.length).toBeGreaterThan(0);
        expect(path).toBeDefined();
      }
    });

    it('every dashboard uses a unique UID', () => {
      const uids = dashboards.map((d) => d.json.uid);
      const unique = new Set(uids);
      expect(unique.size).toBe(uids.length);
    });

    it('every dashboard uid is also unique against the existing dashboards', () => {
      const existing = [
        loadJson('grafana/dashboards/attraccess-overview.json').uid,
        loadJson('grafana/dashboards/node-runtime.json').uid,
      ];
      for (const { json } of dashboards) {
        expect(existing).not.toContain(json.uid);
      }
    });

    it('every panel references the prometheus datasource UID', () => {
      for (const { json } of dashboards) {
        for (const panel of json.panels) {
          expect(panel.datasource).toBeDefined();
          expect(panel.datasource.uid).toBe('attraccess-prometheus');
        }
      }
    });

    it('every metric referenced in a panel target exists in the metrics module', () => {
      const unknown: string[] = [];
      for (const { path, json } of dashboards) {
        for (const expr of collectPanelExprs(json)) {
          for (const ref of extractMetricRefs(expr)) {
            const base = stripHistogramSuffix(ref);
            if (!knownMetrics.has(base)) {
              unknown.push(`${path}: ${ref} (base ${base})`);
            }
          }
        }
      }
      expect(unknown).toEqual([]);
    });

    it('every panel target has at least one metric reference', () => {
      for (const { path, json } of dashboards) {
        for (const panel of json.panels) {
          for (const target of panel.targets ?? []) {
            if (!target.expr) continue;
            const refs = extractMetricRefs(target.expr);
            expect(refs.length).toBeGreaterThan(0);
            expect(path).toBeDefined();
          }
        }
      }
    });

    it('performance overview includes panels for each subsystem', () => {
      const found = dashboards.find((d) => d.path.endsWith('attraccess-performance-overview.json'));
      expect(found).toBeDefined();
      const overview = found?.json as Dashboard;
      const allText = JSON.stringify(overview);
      const subsystemFamilies = [
        'attraccess_http_request_duration_seconds',
        'attraccess_ws_message_duration_seconds',
        'attraccess_cron_job_duration_seconds',
        'attraccess_db_query_duration_seconds',
        'attraccess_external_call_duration_seconds',
        'attraccess_sse_',
        'attraccess_flow_execution_duration_seconds',
      ];
      for (const family of subsystemFamilies) {
        expect(allText).toContain(family);
      }
    });
  });
});
