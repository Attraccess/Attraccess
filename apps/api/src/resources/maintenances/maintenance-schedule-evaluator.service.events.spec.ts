import { registerMaintenanceScheduleEvaluatorServiceFixture } from './maintenance-schedule-evaluator.service.maintenance-schedule-evaluator-service.test-fixture';

import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';

import { ResourceUsageLifecycleAbortedEvent } from './../usage/events/resource-usage.events';

import { ResourceOperatingStateChangedEvent } from './../operating-intervals/events/resource-operating-state-changed.event';

describe('MaintenanceScheduleEvaluatorService', () => {
  const fixture = registerMaintenanceScheduleEvaluatorServiceFixture();

  describe('onResourceUsage', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not call evaluateResource when usage has no resource or resource id', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();

      fixture.service.onResourceUsage(fixture.usageEndedEvent({ id: 1, resource: null }));
      jest.runAllTimers();
      expect(evalSpy).not.toHaveBeenCalled();

      fixture.service.onResourceUsage(fixture.usageEndedEvent({ id: 1, resource: {} }));
      jest.runAllTimers();
      expect(evalSpy).not.toHaveBeenCalled();
    });

    it('should reevaluate when an open session starts', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = fixture.usageEndedEvent({
        id: 1,
        endTime: null,
        resource: { id: fixture.resourceId },
      });

      fixture.service.onResourceUsage(event);
      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });

    it('should call evaluateResource after debounce when session ended', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = fixture.usageEndedEvent({
        id: 1,
        endTime: new Date(),
        resource: { id: fixture.resourceId },
      });

      fixture.service.onResourceUsage(event);

      // Not called yet (debounce pending)
      expect(evalSpy).not.toHaveBeenCalled();

      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });

    it.each(['operating', 'idle'] as const)('reevaluates after the committed %s transition', (state) => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      fixture.service.onOperatingStateChanged(new ResourceOperatingStateChangedEvent(fixture.resourceId, state));
      expect(evalSpy).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });

    it('reevaluates resumed session duration after an aborted lifecycle commits', () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      fixture.service.onUsageLifecycleAborted(new ResourceUsageLifecycleAbortedEvent(fixture.resourceId));
      expect(evalSpy).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });

    it('should debounce: only call evaluateResource once for rapid successive events', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = fixture.usageEndedEvent({
        id: 1,
        endTime: new Date(),
        resource: { id: fixture.resourceId },
      });

      fixture.service.onResourceUsage(event);
      fixture.service.onResourceUsage(event);
      fixture.service.onResourceUsage(event);

      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledTimes(1);
    });

    it('should evaluate different resources independently (no cross-resource debounce)', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();

      fixture.service.onResourceUsage(fixture.usageEndedEvent({ id: 1, endTime: new Date(), resource: { id: 1 } }));
      fixture.service.onResourceUsage(fixture.usageEndedEvent({ id: 2, endTime: new Date(), resource: { id: 2 } }));

      jest.runAllTimers();

      expect(evalSpy).toHaveBeenCalledWith(1);
      expect(evalSpy).toHaveBeenCalledWith(2);
      expect(evalSpy).toHaveBeenCalledTimes(2);
    });

    it('should fire after maxWait even when events keep arriving (prevents starvation)', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = fixture.usageEndedEvent({
        id: 1,
        endTime: new Date(),
        resource: { id: fixture.resourceId },
      });

      // Keep sending events every 4s (within the 5s debounce window)
      fixture.service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=4s — debounce resets, still pending
      fixture.service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=8s — debounce resets, still pending
      fixture.service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=12s — debounce resets, still pending
      fixture.service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=16s — debounce resets, still pending
      fixture.service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=20s — debounce resets, still pending
      fixture.service.onResourceUsage(event);
      jest.advanceTimersByTime(4_000); // t=24s — debounce resets, still pending
      fixture.service.onResourceUsage(event);

      // Not yet called — maxWait (30s) not reached and no event gap ≥ 5s
      expect(evalSpy).not.toHaveBeenCalled();

      // Advance to t=30s — maxWait deadline reached, next timer fires immediately
      jest.advanceTimersByTime(6_000);

      expect(evalSpy).toHaveBeenCalledTimes(1);
      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });
  });

  describe('onMaintenanceChanged', () => {
    it('should call evaluateResource when maintenance changed (e.g. marked done)', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = new ResourceMaintenanceChangedEvent(fixture.resourceId, 99);

      fixture.service.onMaintenanceChanged(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(evalSpy).toHaveBeenCalledWith(fixture.resourceId);
    });

    it('should not call evaluateResource when resourceId is null', async () => {
      const evalSpy = jest.spyOn(fixture.service, 'evaluateResource').mockResolvedValue();
      const event = new ResourceMaintenanceChangedEvent(null as never, 99);

      fixture.service.onMaintenanceChanged(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(evalSpy).not.toHaveBeenCalled();
    });
  });
});
