/* eslint-disable @typescript-eslint/no-explicit-any */

import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { ResourceActionGuard } from './resource-action.guard';
import { registerAttractapSessionHandlerSessionFlowButtonFixture } from './session.handler.attractap-session-handler-session-flow-button.test-fixture';
export function registerLiveUsageStatsCases(
  fixture: ReturnType<typeof registerAttractapSessionHandlerSessionFlowButtonFixture>,
) {
  describe('live usage stats', () => {
    const request = { payload: { resourceId: 10, requestId: 7 } } as any;
    const startTime = new Date('2026-10-03T10:00:00Z');
    beforeEach(() => {
      fixture.mockResourceUsageService.getActiveSession.mockResolvedValue({ id: 99, userId: 1, startTime });
      fixture.metering.getLive.mockResolvedValue({ session: { usageId: 99, latestKwh: '0.125' } });
      fixture.operating.getForResource.mockResolvedValue({
        operatingDataAvailable: true,
        isOperating: true,
        attributions: [
          { usageId: 99, durationMs: 120000 },
          { usageId: 98, durationMs: 80000 },
        ],
      });
    });
    it('returns energy and operating time attributed to the current usage', async () => {
      await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
      expect(fixture.operating.getForResource).toHaveBeenCalledWith(10, expect.any(Date), startTime);
      expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
        new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, {
          resourceId: 10,
          requestId: 7,
          usage: { id: 99, energyKwh: '0.125', operatingDurationMs: 120000, isOperating: true },
        }),
      );
    });
    it('keeps unavailable readings distinct from zero and discards a different meter session', async () => {
      fixture.metering.getLive.mockResolvedValue({ session: { usageId: 100, latestKwh: '9' } });
      fixture.operating.getForResource.mockResolvedValue({ operatingDataAvailable: false, attributions: [] });
      await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
      expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toEqual({
        id: 99,
        energyKwh: null,
        operatingDurationMs: null,
        isOperating: null,
      });
    });
    it.each([null, { id: 99, userId: 2, startTime }])(
      'does not expose readings without an owned session (%p)',
      async (usage) => {
        fixture.mockResourceUsageService.getActiveSession.mockResolvedValue(usage);
        await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
        expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
        expect(fixture.metering.getLive).not.toHaveBeenCalled();
      },
    );
    it('does not query when the reader/card guard rejects the request', async () => {
      fixture.mockResourceActionGuard.validateResourceAction.mockResolvedValue(false);
      await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
      expect(fixture.mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
    });
    describe('reader access with the actual resource guard', () => {
      let reader: { id: number; resources: { id: number }[] };
      beforeEach(() => {
        reader = { id: 42, resources: [{ id: 10 }] };
        (fixture.handler as any).resourceActionGuard = Object.assign(new ResourceActionGuard(), {
          attractapService: { findReaderById: jest.fn(async () => reader) },
          usersService: fixture.mockUsersService,
        });
      });
      it.each(['USER_NOT_AUTHENTICATED', 'RESOURCE_NOT_ASSOCIATED_WITH_READER'])(
        'rejects %s without looking up or disclosing readings',
        async (error) => {
          if (error === 'USER_NOT_AUTHENTICATED') (fixture.mockSocket.state as any).lastAuthenticatedUserId = null;
          else reader.resources = [];
          await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
          expect(fixture.mockSocket.sendMessage).toHaveBeenCalledWith(
            new AttractapEvent(AttractapEventType.RESOURCE_USAGE_STATS, { requestId: 7, error }),
          );
          expect(fixture.mockResourceUsageService.getActiveSession).not.toHaveBeenCalled();
          expect(fixture.metering.getLive).not.toHaveBeenCalled();
          expect(fixture.operating.getForResource).not.toHaveBeenCalled();
        },
      );
      it('allows an authenticated session owner on a mapped resource', async () => {
        await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
        expect(fixture.metering.getLive).toHaveBeenCalledWith(10);
        expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toMatchObject({
          id: 99,
          energyKwh: '0.125',
          operatingDurationMs: 120000,
        });
      });
    });
    it('discards results when the card changes during the lookup', async () => {
      fixture.metering.getLive.mockImplementation(async () => {
        fixture.mockSocket.state.lastAuthenticatedUserId = 2;
        return { session: null };
      });
      await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
      expect(fixture.mockSocket.sendMessage).not.toHaveBeenCalled();
    });
    it('clears readings when the data service fails without failing the reader session', async () => {
      fixture.metering.getLive.mockRejectedValue(new Error('database unavailable'));
      await fixture.handler.handleResourceUsageStats(fixture.mockSocket as any, request);
      expect(fixture.mockSocket.sendMessage.mock.calls[0][0].data.payload.usage).toBeNull();
    });
  });
}
