import type { SocketState } from './supervision.handler.attractap-supervision-handler.test-fixture';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttractapEventType } from '../websocket.types';
import { registerAttractapSupervisionHandlerFixture } from './supervision.handler.attractap-supervision-handler.test-fixture';
export function registerArmReaderCases(fixture: ReturnType<typeof registerAttractapSupervisionHandlerFixture>) {
  describe('armReader', () => {
    it('arms every socket of the reader and tells it to wait for a card', async () => {
      const socket = fixture.makeSocket();
      fixture.websocketService.sockets.set('a', socket);

      await fixture.arm();

      expect(socket.state.supervisionFlow).toEqual({
        resourceId: fixture.RESOURCE_ID,
        requesterUserId: fixture.requester.id,
        requestId: 'req-1',
        approvedSupervisorUserId: null,
        webInitiated: true,
      });
      expect(socket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AttractapEventType.SUPERVISION_START }),
        }),
      );
    });

    // Regression: lastAuthenticatedUserId is a sticky record of the last card ever tapped, cleared
    // only by the enrollment paths. Keying "busy" on it made every reader in real use permanently
    // unavailable, which took the whole feature offline.
    it('arms a reader that has been tapped before but is otherwise idle', async () => {
      const socket = fixture.makeSocket({ lastAuthenticatedUserId: 99 });
      fixture.websocketService.sockets.set('a', socket);

      await expect(fixture.arm()).resolves.toBeDefined();
      expect(socket.state.supervisionFlow).not.toBeNull();
    });

    it.each([
      ['enrollment', { enrollNewCardData: { key: 'k', keyNo: 1, cardUID: 'uid' } }],
      ['a card reset', { resetNfcCardData: { cardId: 1, key: 'k', keyNo: 1 } }],
      [
        'another supervision flow',
        { supervisionFlow: { resourceId: 1, requesterUserId: 1, requestId: 'other', approvedSupervisorUserId: null } },
      ],
    ])('refuses a reader busy with %s', async (_label, state) => {
      fixture.websocketService.sockets.set('a', fixture.makeSocket(state as Partial<SocketState>));

      await expect(fixture.arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a reader whose resource has a session in progress', async () => {
      fixture.websocketService.sockets.set('a', fixture.makeSocket());
      fixture.resourceUsageService.getActiveSession.mockResolvedValueOnce({ id: 5 });

      await expect(fixture.arm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an offline reader', async () => {
      await expect(fixture.arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a reader with no display', async () => {
      fixture.websocketService.sockets.set('a', fixture.makeSocket());
      fixture.attractapService.findReaderById.mockResolvedValueOnce({
        id: fixture.READER_ID,
        firmware: { capabilities: { cardEnrollment: false } },
        resources: [],
      });

      await expect(fixture.arm()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unknown reader', async () => {
      fixture.attractapService.findReaderById.mockResolvedValueOnce(undefined);

      await expect(fixture.arm()).rejects.toBeInstanceOf(NotFoundException);
    });

    // sendMessage resolves false after exhausting its ACK retries rather than throwing, so a reader
    // that is connected but not listening used to arm "successfully" — 200 plus a 30s countdown at a
    // screen that never appeared.
    it('refuses a reader that never acknowledges, and leaves no flow behind', async () => {
      const socket = fixture.makeSocket();
      (socket.sendMessage as jest.Mock).mockResolvedValue(false);
      fixture.websocketService.sockets.set('a', socket);

      await expect(fixture.arm()).rejects.toBeInstanceOf(BadRequestException);
      expect(socket.state.supervisionFlow).toBeNull();
    });

    it('arms when at least one of the reader sockets acknowledges', async () => {
      const stale = fixture.makeSocket();
      (stale.sendMessage as jest.Mock).mockResolvedValue(false);
      const live = fixture.makeSocket();
      fixture.websocketService.sockets.set('a', stale);
      fixture.websocketService.sockets.set('b', live);

      await expect(fixture.arm()).resolves.toBeDefined();
      expect(live.state.supervisionFlow).not.toBeNull();
    });

    // The session lookup is a DB round-trip; with it after the socket check, two concurrent arms
    // both passed the check before either claimed the socket, and the second silently overwrote the
    // first — leaving the first requester with no resolution and no failure.
    it('does not let a concurrent arm overwrite an in-flight one', async () => {
      const socket = fixture.makeSocket();
      fixture.websocketService.sockets.set('a', socket);

      const results = await Promise.allSettled([fixture.arm(), fixture.arm()]);

      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    });
  });
}
