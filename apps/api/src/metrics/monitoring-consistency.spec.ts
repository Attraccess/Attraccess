import { readFileSync } from 'fs';
import { join } from 'path';

const MONITORING_ROOT = join(__dirname, '..', '..', '..', '..', 'monitoring');

function loadJson(relativePath: string) {
  return JSON.parse(readFileSync(join(MONITORING_ROOT, relativePath), 'utf-8'));
}

function loadYaml(relativePath: string) {
  return readFileSync(join(MONITORING_ROOT, relativePath), 'utf-8');
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
});
