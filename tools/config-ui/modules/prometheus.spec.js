/**
 * Tests for prometheus.js config generation, YAML sanitization, and API key
 * persistence policy (api key lives only in prometheus.yml, not settings.json).
 */

jest.mock('http', () => ({
  request: jest.fn(() => ({
    on: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
  })),
}));

function buildFsMock({ configContent } = {}) {
  const writes = {};
  const chmods = {};
  const mockFs = {
    readFileSync: jest.fn((p) => {
      if (typeof p === 'string' && p.endsWith('prometheus.yml') && configContent !== undefined) {
        return configContent;
      }
      throw new Error('not found');
    }),
    writeFileSync: jest.fn((p, content, opts) => {
      writes[p] = { content, opts };
    }),
    mkdirSync: jest.fn(),
    chmodSync: jest.fn((p, mode) => {
      chmods[p] = mode;
    }),
  };
  return { mockFs, writes, chmods };
}

function loadModuleWithEnv(envOverrides = {}, fsOptions) {
  const savedEnv = {};
  for (const key of Object.keys(envOverrides)) {
    savedEnv[key] = process.env[key];
    process.env[key] = envOverrides[key];
  }

  const { mockFs, writes, chmods } = buildFsMock(fsOptions);
  jest.doMock('fs', () => mockFs);
  jest.resetModules();
  const mod = require('./prometheus');

  const restore = () => {
    for (const key of Object.keys(envOverrides)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  };

  return { mod, mockFs, writes, chmods, restore };
}

function getGeneratedConfig(envOverrides = {}, fsOptions) {
  const { mod, writes, restore } = loadModuleWithEnv(envOverrides, fsOptions);
  mod.init();
  restore();
  const promYml = Object.entries(writes).find(([p]) => p.endsWith('prometheus.yml'));
  return promYml ? promYml[1].content : '';
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
      const globalScrapeIntervalLine = lines.find((l) => l.match(/^ {2}scrape_interval:/));
      const globalEvalIntervalLine = lines.find((l) => l.match(/^ {2}evaluation_interval:/));

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
        PROMETHEUS_METRICS_API_KEY: 'key\nremote_write:\n  - url: http://evil.com',
      });

      const lines = config.split('\n');
      const remoteWriteLine = lines.find((l) => l.trim().startsWith('remote_write:'));
      expect(remoteWriteLine).toBeUndefined();
    });

    it('strips carriage returns and newlines from metricsApiKey preventing YAML key injection', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_METRICS_API_KEY: 'key\r\nevil_config: true',
      });

      const lines = config.split('\n');
      const evilLine = lines.find((l) => l.trim().startsWith('evil_config:'));
      expect(evilLine).toBeUndefined();
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

      const lines = config.split('\n');
      const targetLines = lines.filter((l) => l.includes('targets:'));
      expect(targetLines).toHaveLength(1);
    });

    it('sanitizes scrapeInterval — newlines stripped so no new YAML keys injected', () => {
      const config = getGeneratedConfig({
        PROMETHEUS_SCRAPE_INTERVAL: '10s\nmalicious_key: true',
      });

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

    it('includes bearer_token when metricsApiKey is set via env', () => {
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

    it('preserves bearer_token from existing prometheus.yml when env is unset', () => {
      const existing = "scrape_configs:\n  - job_name: 'attraccess'\n    bearer_token: 'existing-key-123'\n";
      const config = getGeneratedConfig({}, { configContent: existing });
      expect(config).toContain("bearer_token: 'existing-key-123'");
    });
  });
});

describe('secret persistence policy', () => {
  function invokeHandler(mod, method, subPath, subParts, body) {
    let capturedStatus;
    let capturedJson;
    const helpers = {
      readBody: async () => body || {},
      sendJson: (res, status, data) => {
        capturedStatus = status;
        capturedJson = data;
      },
    };
    return mod
      .handleRequest(method, subPath, subParts, null, null, helpers)
      .then(() => ({ status: capturedStatus, body: capturedJson }));
  }

  it('settings.json does NOT contain metricsApiKey after a PUT /settings', async () => {
    const { mod, writes, restore } = loadModuleWithEnv({});
    try {
      await invokeHandler(mod, 'PUT', '/settings', [], {
        scrapeInterval: '15s',
        metricsApiKey: 'super-secret-should-not-be-persisted',
      });
    } finally {
      restore();
    }

    const settingsWrite = Object.entries(writes).find(([p]) => p.endsWith('prometheus-settings.json'));
    expect(settingsWrite).toBeDefined();
    const parsed = JSON.parse(settingsWrite[1].content);
    expect(parsed).not.toHaveProperty('metricsApiKey');
    expect(parsed.scrapeInterval).toBe('15s');
  });

  it('settings.json is written with mode 0o600', async () => {
    const { mod, writes, chmods, restore } = loadModuleWithEnv({});
    try {
      await invokeHandler(mod, 'PUT', '/settings', [], { scrapeInterval: '15s' });
    } finally {
      restore();
    }

    const settingsPath = Object.keys(writes).find((p) => p.endsWith('prometheus-settings.json'));
    expect(writes[settingsPath].opts).toMatchObject({ mode: 0o600 });
    expect(chmods[settingsPath]).toBe(0o600);
  });

  it('prometheus.yml is written with mode 0o600 when a bearer is present', async () => {
    const { mod, writes, chmods, restore } = loadModuleWithEnv({ PROMETHEUS_METRICS_API_KEY: 'abc' });
    try {
      mod.init();
    } finally {
      restore();
    }

    const ymlPath = Object.keys(writes).find((p) => p.endsWith('prometheus.yml'));
    expect(writes[ymlPath].opts).toMatchObject({ mode: 0o600 });
    expect(chmods[ymlPath]).toBe(0o600);
  });

  it('GET /settings exposes apiKeyConfigured boolean rather than the raw key', async () => {
    const existing = "scrape_configs:\n    bearer_token: 'the-key'\n";
    const { mod, restore } = loadModuleWithEnv({}, { configContent: existing });
    try {
      const { status, body } = await invokeHandler(mod, 'GET', '/settings', []);
      expect(status).toBe(200);
      expect(body).not.toHaveProperty('metricsApiKey');
      expect(body.apiKeyConfigured).toBe(true);
    } finally {
      restore();
    }
  });

  it('DELETE /api-key rewrites prometheus.yml without bearer_token', async () => {
    const existing = "scrape_configs:\n    bearer_token: 'the-key'\n";
    const { mod, writes, restore } = loadModuleWithEnv({}, { configContent: existing });
    try {
      await invokeHandler(mod, 'DELETE', '/api-key', []);
    } finally {
      restore();
    }

    const ymlPath = Object.keys(writes).find((p) => p.endsWith('prometheus.yml'));
    expect(writes[ymlPath].content).not.toContain('bearer_token');
  });

  it('PUT /settings without metricsApiKey preserves the existing bearer from prometheus.yml', async () => {
    const existing = "scrape_configs:\n    bearer_token: 'kept-on-disk'\n";
    const { mod, writes, restore } = loadModuleWithEnv({}, { configContent: existing });
    try {
      await invokeHandler(mod, 'PUT', '/settings', [], { scrapeInterval: '20s' });
    } finally {
      restore();
    }

    const ymlPath = Object.keys(writes).find((p) => p.endsWith('prometheus.yml'));
    expect(writes[ymlPath].content).toContain("bearer_token: 'kept-on-disk'");
  });
});
