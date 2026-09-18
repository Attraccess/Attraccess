import { BadRequestException } from '@nestjs/common';
import { ResourceOperatingDiagnosticsController } from './resource-operating-diagnostics.controller';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';

describe('ResourceOperatingDiagnosticsController', () => {
  let diagnosticsService: jest.Mocked<
    Pick<
      ResourceOperatingDiagnosticsService,
      'getCurrentState' | 'getTransitionHistory' | 'getUnattributedSummary' | 'getDataQualityReport' | 'verifyTimeline'
    >
  >;
  let controller: ResourceOperatingDiagnosticsController;

  beforeEach(() => {
    diagnosticsService = {
      getCurrentState: jest.fn().mockResolvedValue({ state: 'idle', openInterval: null, lastTransitionAt: null }),
      getTransitionHistory: jest.fn().mockResolvedValue({ items: [], totalIntervals: 0, page: 1, limit: 20 }),
      getUnattributedSummary: jest.fn().mockResolvedValue({
        asOf: new Date('2026-09-10T00:00:00.000Z'),
        windowStart: new Date('2026-09-01T00:00:00.000Z'),
        operatingDurationMs: 1000,
        attributedOperatingDurationMs: 400,
        unattributedOperatingDurationMs: 600,
        isProvisional: false,
        attributions: [],
      }),
      getDataQualityReport: jest.fn().mockResolvedValue({ issues: [] }),
      verifyTimeline: jest.fn().mockResolvedValue({ consistent: true }),
    };
    controller = new ResourceOperatingDiagnosticsController(
      diagnosticsService as unknown as ResourceOperatingDiagnosticsService,
    );
  });

  it('returns the current state for the requested resource', async () => {
    await expect(controller.getState(12)).resolves.toEqual({ state: 'idle', openInterval: null, lastTransitionAt: null });
    expect(diagnosticsService.getCurrentState).toHaveBeenCalledWith(12);
  });

  it('passes pagination defaults to the transition history', async () => {
    await controller.getTransitions(12, {});

    expect(diagnosticsService.getTransitionHistory).toHaveBeenCalledWith(12, 1, 20);
  });

  it('passes explicit pagination through', async () => {
    await controller.getTransitions(12, { page: 3, limit: 5 });

    expect(diagnosticsService.getTransitionHistory).toHaveBeenCalledWith(12, 3, 5);
  });

  it('resolves an explicit unattributed range and maps the summary to the dto', async () => {
    const result = await controller.getUnattributed(12, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-10T00:00:00.000Z',
    });

    expect(diagnosticsService.getUnattributedSummary).toHaveBeenCalledWith(
      12,
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-10T00:00:00.000Z'),
    );
    expect(result).toEqual({
      asOf: new Date('2026-09-10T00:00:00.000Z'),
      windowStart: new Date('2026-09-01T00:00:00.000Z'),
      operatingDurationMs: 1000,
      attributedOperatingDurationMs: 400,
      unattributedOperatingDurationMs: 600,
      isProvisional: false,
      attributionCount: 0,
    });
  });

  it('defaults the unattributed range to the 31-day attribution window ending now', async () => {
    const before = Date.now();
    await controller.getUnattributed(12, {});
    const after = Date.now();

    const [resourceId, from, to] = diagnosticsService.getUnattributedSummary.mock.calls[0];
    expect(resourceId).toBe(12);
    expect(to.getTime()).toBeGreaterThanOrEqual(before);
    expect(to.getTime()).toBeLessThanOrEqual(after);
    expect(to.getTime() - from.getTime()).toBe(31 * 24 * 60 * 60_000);
  });

  it('rejects an inverted range', () => {
    expect(() =>
      controller.verifyTimeline(12, { from: '2026-09-10T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }),
    ).toThrow(BadRequestException);
  });

  it('runs data quality with the resolved range end', async () => {
    await controller.getDataQuality(12, { to: '2026-09-10T00:00:00.000Z' });

    expect(diagnosticsService.getDataQualityReport).toHaveBeenCalledWith(12, new Date('2026-09-10T00:00:00.000Z'));
  });

  it('runs timeline verification over the resolved range', async () => {
    await controller.verifyTimeline(12, { from: '2026-09-01T00:00:00.000Z', to: '2026-09-10T00:00:00.000Z' });

    expect(diagnosticsService.verifyTimeline).toHaveBeenCalledWith(
      12,
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-10T00:00:00.000Z'),
    );
  });
});
