/**
 * Tests for prometheus.js config generation and YAML sanitization.
 *
 * Run with: npx jest --config='{"testEnvironment":"node"}' tools/config-ui/modules/prometheus.spec.js
 */

const fs = require('fs');
const path = require('path');

jest.mock('http', () => ({
  request: jest.fn(() => ({
    on: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
  })),
}));

function getGeneratedConfig(envOverrides = {}) {
  const originalEnv = {};
  for (const key of Object.keys(envOverrides)) {
    originalEnv[key] = process.env[key];
    process.env[key] = envOverrides[key];
  }

  let writtenConfig = '';
  const mockFs = {
    readFileSync: jest.fn(() => { throw new Error('not found'); }),
    writeFileSync: jest.fn((_p, content) => { writtenConfig = content; }),
    mkdirSync: jest.fn(),
  };

  jest.doMock('fs', () => mockFs);
  jest.resetModules();

  const mod = require('./prometheus');
  mod.init();

  for (const key of Object.keys(envOverrides)) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }

  return writtenConfig;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('generatePrometheusConfig (via init/writePrometheusConfig)', () => {
  describe('issue #7: scrapeInterval vs evaluationInterval bug fix', () => {
    it('uses scrapeInterval for global scrape_interval (not evaluationInterval)', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_SCRAPE_INTERVAL: '30s',
        PROMETHEUS_EVALUATION_INTERVAL: '60s',
      });

      const lines = config.split('\n');
      const globalScrapeIntervalLine = lines.find((l) => l.match(/^  scrape_interval:/));
      const globalEvalIntervalLine = lines.find((l) => l.match(/^  evaluation_interval:/));

      expect(globalScrapeIntervalLine).toContain('30s');
      expect(globalEvalIntervalLine).toContain('60s');
      expect(globalScrapeIntervalLine).not.toContain('60s');
    });
  });

  describe('issue #5: YAML injection prevention', () => {
    it('strips single quotes from metricsApiKey', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: "key'with'quotes",
      });

      expect(config).not.toContain("key'with'quotes");
      expect(config).toContain('keywithquotes');
    });

    it('strips newlines from metricsApiKey preventing separate YAML directives', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: "key\nremote_write:\n  - url: http://evil.com",
      });

      // Newlines stripped — "remote_write:" cannot be a standalone YAML key
      const lines = config.split('\n');
      const remoteWriteLine = lines.find((l) => l.trim().startsWith('remote_write:'));
      expect(remoteWriteLine).toBeUndefined();
    });

    it('strips carriage returns and newlines from metricsApiKey preventing YAML key injection', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: "key\r\nevil_config: true",
      });

      // The \r\n are stripped so "evil_config: true" cannot appear on its own line
      const lines = config.split('\n');
      const evilLine = lines.find((l) => l.trim().startsWith('evil_config:'));
      expect(evilLine).toBeUndefined();
      // The remaining text becomes harmless inline content
      expect(config).toContain('keyevil_config: true');
    });

    it('strips backslashes from metricsApiKey', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: 'key\\nstill-injected',
      });

      expect(config).toContain('keynstill-injected');
    });

    it('sanitizes attraccessTarget to prevent YAML injection via newline', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_ATTRACCESS_TARGET: "evil:9090']\n  - targets: ['attacker:9090",
        PROMETHEUS_METRICS_API_KEY: 'test-key',
      });

      // Newlines are stripped, so the injected targets line cannot appear
      // as a separate YAML key on its own line
      const lines = config.split('\n');
      const targetLines = lines.filter((l) => l.includes('targets:'));
      expect(targetLines).toHaveLength(1);
    });

    it('sanitizes scrapeInterval — newlines stripped so no new YAML keys injected', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_SCRAPE_INTERVAL: "10s\nmalicious_key: true",
      });

      // The newline is stripped, so malicious_key can't be a separate YAML key
      const lines = config.split('\n');
      const maliciousLine = lines.find((l) => l.startsWith('malicious_key:'));
      expect(maliciousLine).toBeUndefined();
    });
  });

  describe('config structure', () => {
    it('includes rule_files referencing alerts.yml', () => {
      const config = getGeneratedConfig();

      expect(config).toContain('rule_files:');
      expect(config).toContain('alerts.yml');
    });

    it('includes bearer_token when metricsApiKey is set', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: 'my-secret-key',
      });

      expect(config).toContain('bearer_token');
      expect(config).toContain('my-secret-key');
    });

    it('does not include bearer_token when metricsApiKey is empty', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: '',
      });

      expect(config).not.toContain('bearer_token');
    });
  });
});
