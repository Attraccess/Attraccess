const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

describe('Prometheus storage failures', () => {
  let directory, configPath, settingsPath, mod, previousEnv;
  const saved = { scrapeInterval: '20s', evaluationInterval: '30s', attraccessTarget: 'old-target:3001' };
  const updated = { scrapeInterval: '22s', attraccessTarget: 'new-target:3001', metricsApiKey: 'new-key' };
  const initialYaml = "global:\n  scrape_interval: 20s\n  bearer_token: 'old-key'\n";

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prometheus-save-'));
    configPath = path.join(directory, 'prometheus.yml');
    settingsPath = path.join(directory, 'prometheus-settings.json');
    fs.writeFileSync(configPath, initialYaml, { mode: 0o644 });
    fs.writeFileSync(settingsPath, JSON.stringify(saved), { mode: 0o600 });
    previousEnv = { ...process.env };
    process.env.PROMETHEUS_DATA_DIR = directory;
    process.env.PROMETHEUS_CONFIG_PATH = configPath;
    delete process.env.PROMETHEUS_METRICS_API_KEY;
    jest.resetModules();
    mod = require('./prometheus');
    jest.spyOn(http, 'request').mockReturnValue({ on: jest.fn(), end: jest.fn() });
    jest.spyOn(console, 'log').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = previousEnv;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function invoke(method = 'PUT', subPath = '/settings', body = updated) {
    let response;
    await mod.handleRequest(method, subPath, [], null, null, {
      readBody: async () => body,
      sendJson: (_res, status, data) => {
        response = { status, data };
      },
    });
    return response;
  }

  function assertUnchanged() {
    expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))).toEqual(saved);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(initialYaml);
    expect(http.request).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  }

  it('rejects a read-only generated file without persisting settings and recovers after permissions are restored', async () => {
    fs.chmodSync(configPath, 0o400);
    expect((await invoke()).status).toBe(500);
    assertUnchanged();
    fs.chmodSync(configPath, 0o644);
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      scrapeInterval: '22s',
      attraccessTarget: 'new-target:3001',
      apiKeyConfigured: true,
    });
    expect(result.data).not.toHaveProperty('metricsApiKey');
    expect(fs.readFileSync(configPath, 'utf8')).toContain("bearer_token: 'new-key'");
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(stored).toEqual({ ...saved, scrapeInterval: '22s', attraccessTarget: 'new-target:3001' });
    expect(fs.statSync(settingsPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(configPath).mode & 0o777).toBe(0o644);
    expect(http.request).toHaveBeenCalledTimes(1);
    expect((await invoke('GET')).data).toEqual(result.data);
  });

  it('keeps the previous YAML intact when writing fails after partial output', async () => {
    const write = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((file, content, options) => {
      write(file, String(content).slice(0, 10), options);
      throw new Error('ENOSPC: storage full');
    });
    expect((await invoke()).status).toBe(500);
    assertUnchanged();
  });

  it('restores the previous YAML and key if settings cannot be persisted', async () => {
    fs.chmodSync(settingsPath, 0o400);
    expect((await invoke()).status).toBe(500);
    assertUnchanged();
  });

  it('does not truncate persisted settings when their write fails midway', async () => {
    const write = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((file, content, options) => {
      if (String(file).startsWith(settingsPath)) {
        write(file, '{', options);
        throw new Error('ENOSPC: storage full');
      }
      return write(file, content, options);
    });
    expect((await invoke()).status).toBe(500);
    assertUnchanged();
  });

  it('reports a failed key removal and retains the previous key', async () => {
    fs.chmodSync(configPath, 0o400);
    expect((await invoke('DELETE', '/api-key')).status).toBe(500);
    assertUnchanged();
  });

  it('reports rollback failure explicitly without claiming success or reloading', async () => {
    fs.chmodSync(settingsPath, 0o400);
    const rename = fs.renameSync;
    jest
      .spyOn(fs, 'renameSync')
      .mockImplementationOnce(rename)
      .mockImplementation(() => {
        throw new Error('rollback storage error');
      });
    expect(await invoke()).toMatchObject({
      status: 500,
      data: { error: expect.stringContaining('restore the configuration') },
    });
    expect(http.request).not.toHaveBeenCalled();
  });
});
