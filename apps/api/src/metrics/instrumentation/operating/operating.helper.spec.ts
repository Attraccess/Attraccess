// Unit tests for the operating-timeline metrics recorder (ATT-1024)
// FEATURE: Metrics — machine operating timeline observability
import { Registry } from 'prom-client';
import { createOperatingMetrics } from '../../definitions/operating.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';
import { OperatingMetricsRecorder } from './operating.helper';

describe('OperatingMetricsRecorder', () => {
  function setup(enabled = true) {
    const registry = new Registry();
    const metrics = createOperatingMetrics(registry);
    const toggle = { isEnabledCached: jest.fn().mockReturnValue(enabled) } as unknown as MetricsToggleService;
    const recorder = new OperatingMetricsRecorder(metrics, toggle);
    return { registry, recorder };
  }

  it('counts applied and noop transitions by state', async () => {
    const { registry, recorder } = setup();

    recorder.recordTransition('operating', true);
    recorder.recordTransition('operating', false);
    recorder.recordTransition('idle', true);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_operating_transitions_total{state="operating",result="applied"} 1');
    expect(text).toContain('attraccess_operating_transitions_total{state="operating",result="noop"} 1');
    expect(text).toContain('attraccess_operating_transitions_total{state="idle",result="applied"} 1');
  });

  it('sets the current-state gauge per resource', async () => {
    const { registry, recorder } = setup();

    recorder.setResourceState(7, 'operating');
    recorder.setResourceState(8, 'idle');

    const text = await registry.metrics();
    expect(text).toContain('attraccess_operating_resource_state{resource_id="7"} 1');
    expect(text).toContain('attraccess_operating_resource_state{resource_id="8"} 0');
  });

  it('counts data-quality failures by kind', async () => {
    const { registry, recorder } = setup();

    recorder.recordDataQualityFailures('stale-signal', 1);
    recorder.recordDataQualityFailures('overlapping-intervals', 3);
    recorder.recordDataQualityFailures('negative-duration', 0);

    const text = await registry.metrics();
    expect(text).toContain('attraccess_operating_data_quality_failures_total{kind="stale-signal"} 1');
    expect(text).toContain('attraccess_operating_data_quality_failures_total{kind="overlapping-intervals"} 3');
    expect(text).not.toContain('negative-duration');
  });

  it('records nothing while the flow metrics toggle is disabled', async () => {
    const { registry, recorder } = setup(false);

    recorder.recordTransition('operating', true);
    recorder.setResourceState(7, 'operating');
    recorder.recordDataQualityFailures('stale-signal', 1);

    const text = await registry.metrics();
    expect(text).not.toContain('attraccess_operating_transitions_total{');
    expect(text).not.toContain('attraccess_operating_resource_state{');
    expect(text).not.toContain('attraccess_operating_data_quality_failures_total{');
  });
});
