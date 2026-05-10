// Unit tests for ExternalCallTimer wrapper recording duration, status, and error type
// FEATURE: Metrics — external call timing instrumentation (SumUp, SMTP, MQTT)
import { Registry } from 'prom-client';
import { createExternalMetrics } from '../../definitions/external.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';
import { ExternalCallTimer } from './external.helper';

describe('ExternalCallTimer.time', () => {
  function setup(enabled = true) {
    const registry = new Registry();
    const metrics = createExternalMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(enabled) } as unknown as MetricsToggleService;
    const timer = new ExternalCallTimer(metrics, toggle);
    return { registry, metrics, timer, toggle };
  }

  afterEach(() => jest.restoreAllMocks());

  it('records success duration with target+operation+status labels', async () => {
    const { registry, timer } = setup();

    await timer.time('sumup', 'checkout', async () => 'ok');

    const text = await registry.metrics();
    expect(text).toContain(
      'attraccess_external_call_duration_seconds_count{target="sumup",operation="checkout",status="success"} 1',
    );
    expect(text).not.toContain('attraccess_external_call_errors_total{');
  });

  it('records error status, increments error counter, and rethrows the original error', async () => {
    const { registry, timer } = setup();
    const original = new Error('boom');

    await expect(
      timer.time('sumup', 'checkout', async () => {
        throw original;
      }),
    ).rejects.toBe(original);

    const text = await registry.metrics();
    expect(text).toContain(
      'attraccess_external_call_duration_seconds_count{target="sumup",operation="checkout",status="error"} 1',
    );
    expect(text).toContain(
      'attraccess_external_call_errors_total{target="sumup",operation="checkout",error_type="unknown"} 1',
    );
  });

  it('classifies timeout errors via message keywords', async () => {
    const { registry, timer } = setup();

    await expect(
      timer.time('smtp', 'send', async () => {
        throw new Error('Request ETIMEDOUT after 30s');
      }),
    ).rejects.toThrow();

    const text = await registry.metrics();
    expect(text).toContain(
      'attraccess_external_call_errors_total{target="smtp",operation="send",error_type="timeout"} 1',
    );
  });

  it('classifies network errors via ECONNREFUSED keyword', async () => {
    const { registry, timer } = setup();

    await expect(
      timer.time('mqtt', 'publish', async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:1883');
      }),
    ).rejects.toThrow();

    const text = await registry.metrics();
    expect(text).toContain(
      'attraccess_external_call_errors_total{target="mqtt",operation="publish",error_type="network"} 1',
    );
  });

  it('classifies auth errors via 401/403 codes', async () => {
    const { registry, timer } = setup();

    await expect(
      timer.time('sumup', 'transactions', async () => {
        throw new Error('Request failed with status 401');
      }),
    ).rejects.toThrow();

    const text = await registry.metrics();
    expect(text).toContain(
      'attraccess_external_call_errors_total{target="sumup",operation="transactions",error_type="auth"} 1',
    );
  });

  it('classifies unknown errors when no keyword matches', async () => {
    const { registry, timer } = setup();

    await expect(
      timer.time('github', 'api', async () => {
        throw new Error('something weird happened');
      }),
    ).rejects.toThrow();

    const text = await registry.metrics();
    expect(text).toContain(
      'attraccess_external_call_errors_total{target="github",operation="api",error_type="unknown"} 1',
    );
  });

  it('skips recording but still runs payload when toggle disabled', async () => {
    const { registry, timer } = setup(false);
    let called = false;

    const result = await timer.time('sumup', 'checkout', async () => {
      called = true;
      return 99;
    });

    expect(called).toBe(true);
    expect(result).toBe(99);
    const text = await registry.metrics();
    expect(text).not.toContain('attraccess_external_call_duration_seconds_count{');
    expect(text).not.toContain('attraccess_external_call_errors_total{');
  });

  it('reads toggle synchronously via isEnabledCached', async () => {
    const { timer, toggle } = setup();

    await timer.time('mqtt', 'subscribe', async () => undefined);

    expect(toggle.isEnabledCached).toHaveBeenCalledWith('external');
    expect(toggle.isEnabledCached).toHaveBeenCalledTimes(1);
  });
});
