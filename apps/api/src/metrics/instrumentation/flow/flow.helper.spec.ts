// Unit tests for FlowTimer wrapper recording flow + node duration and execution counters
// FEATURE: Metrics — resource flow execution instrumentation
import { Registry } from 'prom-client';
import { createFlowMetrics } from '../../definitions/flow.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';
import { FlowTimer } from './flow.helper';

describe('FlowTimer', () => {
  function setup(enabled = true) {
    const registry = new Registry();
    const metrics = createFlowMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(enabled) } as unknown as MetricsToggleService;
    const timer = new FlowTimer(metrics, toggle);
    return { registry, metrics, timer, toggle };
  }

  afterEach(() => jest.restoreAllMocks());

  describe('timeFlow', () => {
    it('records success duration histogram and execution counter', async () => {
      const { registry, timer } = setup();

      const result = await timer.timeFlow('manual.button', async () => 'ok');

      expect(result).toBe('ok');
      const text = await registry.metrics();
      expect(text).toContain(
        'attraccess_flow_executions_total{trigger_type="manual.button",status="success"} 1',
      );
      expect(text).toContain(
        'attraccess_flow_execution_duration_seconds_count{trigger_type="manual.button",status="success"} 1',
      );
    });

    it('records failure status, rethrows, and increments failure counter', async () => {
      const { registry, timer } = setup();

      await expect(
        timer.timeFlow('mqtt.message.received', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const text = await registry.metrics();
      expect(text).toContain(
        'attraccess_flow_executions_total{trigger_type="mqtt.message.received",status="failure"} 1',
      );
      expect(text).toContain(
        'attraccess_flow_execution_duration_seconds_count{trigger_type="mqtt.message.received",status="failure"} 1',
      );
    });
  });

  describe('timeNode', () => {
    it('records success duration histogram on nodeDuration without a counter', async () => {
      const { registry, timer } = setup();

      const result = await timer.timeNode('logic.if', async () => 42);

      expect(result).toBe(42);
      const text = await registry.metrics();
      expect(text).toContain(
        'attraccess_flow_node_duration_seconds_count{node_type="logic.if",status="success"} 1',
      );
      expect(text).not.toContain('attraccess_flow_node_total');
    });

    it('records failure status on nodeDuration and rethrows', async () => {
      const { registry, timer } = setup();

      await expect(
        timer.timeNode('http.send-request', async () => {
          throw new Error('http-fail');
        }),
      ).rejects.toThrow('http-fail');

      const text = await registry.metrics();
      expect(text).toContain(
        'attraccess_flow_node_duration_seconds_count{node_type="http.send-request",status="failure"} 1',
      );
    });

    it('records multiple node types independently', async () => {
      const { registry, timer } = setup();

      await timer.timeNode('logic.if', async () => undefined);
      await timer.timeNode('mqtt.send-message', async () => undefined);
      await timer.timeNode('logic.if', async () => undefined);

      const text = await registry.metrics();
      expect(text).toContain(
        'attraccess_flow_node_duration_seconds_count{node_type="logic.if",status="success"} 2',
      );
      expect(text).toContain(
        'attraccess_flow_node_duration_seconds_count{node_type="mqtt.send-message",status="success"} 1',
      );
    });
  });

  describe('toggle disabled', () => {
    it('still runs payload but records no metrics for timeFlow', async () => {
      const { registry, timer } = setup(false);
      let called = false;

      const result = await timer.timeFlow('manual.button', async () => {
        called = true;
        return 'value';
      });

      expect(called).toBe(true);
      expect(result).toBe('value');
      const text = await registry.metrics();
      expect(text).not.toContain('attraccess_flow_executions_total{');
      expect(text).not.toContain('attraccess_flow_execution_duration_seconds_count{');
    });

    it('still runs payload but records no metrics for timeNode', async () => {
      const { registry, timer } = setup(false);
      let called = false;

      await timer.timeNode('logic.if', async () => {
        called = true;
      });

      expect(called).toBe(true);
      const text = await registry.metrics();
      expect(text).not.toContain('attraccess_flow_node_duration_seconds_count{');
    });

    it('reads toggle synchronously via isEnabledCached', async () => {
      const { timer, toggle } = setup();

      await timer.timeFlow('manual.button', async () => undefined);
      await timer.timeNode('logic.if', async () => undefined);

      expect(toggle.isEnabledCached).toHaveBeenCalledWith('flow');
      expect(toggle.isEnabledCached).toHaveBeenCalledTimes(2);
    });
  });
});
