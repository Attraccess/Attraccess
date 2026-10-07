import { registerResourceListServiceFixture } from './resource-list.service.resource-list-service.test-fixture';

export function registerSendResourceListToReadersWithResourcesCases(
  fixture: ReturnType<typeof registerResourceListServiceFixture>,
) {
  describe('sendResourceListToReadersWithResources', () => {
    it('builds one resource list per reader when several sockets match', async () => {
      const s1 = fixture.createMockSocket({ id: 's1', readerId: 42 });
      const s2 = fixture.createMockSocket({ id: 's2', readerId: 42 });
      fixture.websocketService.sockets.set('s1', s1);
      fixture.websocketService.sockets.set('s2', s2);
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());

      fixture.service.sendResourceListToReadersWithResources([10]);
      await jest.runAllTimersAsync();

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledTimes(1);
      expect(fixture.resourceIntroducersService.getManyForResources).toHaveBeenCalledTimes(1);
      expect(s1.sendMessage).toHaveBeenCalledTimes(1);
      expect(s2.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('refreshes a reader when any of several resources match', async () => {
      const s1 = fixture.createMockSocket({ id: 's1', readerId: 42 });
      fixture.websocketService.sockets.set('s1', s1);
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());

      fixture.service.sendResourceListToReadersWithResources([10, 20]);
      await jest.runAllTimersAsync();

      expect(s1.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not refresh readers when no resources are affected', async () => {
      const s1 = fixture.createMockSocket({ id: 's1', readerId: 42 });
      fixture.websocketService.sockets.set('s1', s1);
      const spy = jest.spyOn(fixture.service, 'sendResourceList').mockResolvedValue(undefined);

      fixture.service.sendResourceListToReadersWithResources([]);

      expect(spy).not.toHaveBeenCalled();
    });

    it('coalesces rapid events and filters by every affected resource', async () => {
      const socket = fixture.createMockSocket({ readerId: 42 });
      fixture.websocketService.sockets.set('socket', socket);
      const spy = jest.spyOn(fixture.service, 'sendResourceList').mockResolvedValue(undefined);

      fixture.service.sendResourceListToReadersWithResources([10]);
      fixture.service.sendResourceListToReadersWithResources([11, 12]);
      await jest.runAllTimersAsync();

      expect(spy).toHaveBeenCalledWith(42, new Set([10, 11, 12]));
    });

    it('sends at the first debounce deadline while events continue arriving', async () => {
      const socket = fixture.createMockSocket({ readerId: 42 });
      fixture.websocketService.sockets.set('socket', socket);
      const spy = jest.spyOn(fixture.service, 'sendResourceList').mockResolvedValue(undefined);

      fixture.service.sendResourceListToReadersWithResources([10]);
      await jest.advanceTimersByTimeAsync(100);
      fixture.service.sendResourceListToReadersWithResources([11]);
      await jest.advanceTimersByTimeAsync(100);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(42, new Set([10, 11]));
    });
  });
}

export function registerSendResourceListCases(fixture: ReturnType<typeof registerResourceListServiceFixture>) {
  describe('sendResourceList', () => {
    it('resolves without calling findReaderById when no sockets match the reader id', async () => {
      fixture.websocketService.sockets.set('a', fixture.createMockSocket({ id: 'a', readerId: 1 }));
      fixture.websocketService.sockets.set('b', fixture.createMockSocket({ id: 'b', readerId: 2 }));

      const spy = jest.spyOn(fixture.service, 'sendResourceListToSocket').mockResolvedValue(undefined);

      await expect(fixture.service.sendResourceList(999)).resolves.toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(fixture.attractapService.findReaderById).not.toHaveBeenCalled();
    });

    it('builds one resource list and sends it to each matching socket', async () => {
      const matchA = fixture.createMockSocket({ id: 'a', readerId: 42 });
      const matchB = fixture.createMockSocket({ id: 'b', readerId: 42 });
      const other = fixture.createMockSocket({ id: 'c', readerId: 7 });
      fixture.websocketService.sockets.set('a', matchA);
      fixture.websocketService.sockets.set('b', matchB);
      fixture.websocketService.sockets.set('c', other);

      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());

      await fixture.service.sendResourceList(42);

      expect(fixture.attractapService.findReaderById).toHaveBeenCalledTimes(1);
      expect(fixture.resourceIntroducersService.getManyForResources).toHaveBeenCalledTimes(1);
      expect(matchA.sendMessage).toHaveBeenCalledTimes(1);
      expect(matchB.sendMessage).toHaveBeenCalledTimes(1);
      expect(other.sendMessage).not.toHaveBeenCalled();
      expect(matchA.sendMessage.mock.calls[0][0]).not.toBe(matchB.sendMessage.mock.calls[0][0]);
      expect(matchA.sendMessage.mock.calls[0][0].data.payload).toBe(matchB.sendMessage.mock.calls[0][0].data.payload);
    });
  });
}
