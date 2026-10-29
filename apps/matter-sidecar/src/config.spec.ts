import { ConfigError, configWith, loadConfig } from './config';

describe('loadConfig', () => {
  it('applies the documented defaults and binds loopback only', () => {
    expect(loadConfig({})).toEqual({
      host: '127.0.0.1',
      port: 8581,
      maxMessageBytes: 1024 * 1024,
      requestDeadlineMs: 10_000,
      shutdownGraceMs: 5_000,
      replayMaxEvents: 1_000,
      replayMaxAgeMs: 300_000,
      clientQueueBytes: 1024 * 1024,
      maxClients: 64,
      firstMessageTimeoutMs: 30_000,
    });
  });

  it('reads overrides from the environment and ignores any host setting', () => {
    const config = loadConfig({
      MATTER_SIDECAR_PORT: '0',
      MATTER_SIDECAR_REPLAY_MAX_EVENTS: '5',
      MATTER_SIDECAR_HOST: '0.0.0.0',
    });
    expect(config).toMatchObject({ port: 0, replayMaxEvents: 5, host: '127.0.0.1' });
  });

  it('fails before listening with an actionable list of problems', () => {
    expect(() => loadConfig({ MATTER_SIDECAR_PORT: 'abc', MATTER_SIDECAR_REQUEST_DEADLINE_MS: '0' })).toThrow(
      ConfigError,
    );
    try {
      loadConfig({ MATTER_SIDECAR_PORT: 'abc' });
    } catch (error) {
      expect((error as ConfigError).problems[0]).toContain('MATTER_SIDECAR_PORT');
    }
  });

  it('configWith binds an ephemeral port', () => {
    expect(configWith({ replayMaxEvents: 3 })).toMatchObject({ port: 0, replayMaxEvents: 3 });
  });
});
