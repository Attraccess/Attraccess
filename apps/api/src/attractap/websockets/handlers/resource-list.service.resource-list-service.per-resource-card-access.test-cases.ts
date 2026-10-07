/* eslint-disable @typescript-eslint/no-explicit-any */

import { SupervisionMode } from '@attraccess/database-entities';
import { registerResourceListServiceFixture } from './resource-list.service.resource-list-service.test-fixture';
export function registerPerResourceCardAccessCases(fixture: ReturnType<typeof registerResourceListServiceFixture>) {
  describe('per-resource card access', () => {
    it('keeps users isolated while sharing list queries and same-user permission results', async () => {
      const a = fixture.createMockSocket({ id: 'a', state: { lastAuthenticatedUserId: 1 } });
      const b = fixture.createMockSocket({ id: 'b', state: { lastAuthenticatedUserId: 2 } });
      const c = fixture.createMockSocket({ id: 'c', state: { lastAuthenticatedUserId: 1 } });
      const guest = fixture.createMockSocket({ id: 'guest' });
      for (const socket of [a, b, c, guest]) fixture.websocketService.sockets.set(socket.id, socket);
      fixture.attractapService.findReaderById.mockResolvedValue(
        fixture.createReaderFixture({
          resources: [
            { id: 10, name: 'Laser', supervisionMode: SupervisionMode.SUPERVISION_ALLOWED },
            { id: 20, name: 'Printer', supervisionMode: SupervisionMode.SUPERVISION_REQUIRED },
          ],
        }),
      );
      fixture.resourceUsageService.canControllResource.mockImplementation(
        async (resourceId, user) => resourceId === 10 && user.id === 1,
      );
      fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds.mockImplementation(async (user) =>
        user.id === 2 ? new Set([20]) : new Set(),
      );
      await fixture.service.sendResourceList(42);
      const payload = (socket: any) => socket.sendMessage.mock.calls[0][0].data.payload;
      expect(payload(a).authenticatedUsername).toBe('user-1');
      expect(payload(b).authenticatedUsername).toBe('user-2');
      expect(payload(c)).toBe(payload(a));
      expect(payload(a).resources[0]).toMatchObject({ hasIntroduction: true, requiresSupervisor: false });
      expect(payload(b).resources[0]).toMatchObject({ hasIntroduction: false, requiresSupervisor: true });
      expect(payload(a).resources[1]).toMatchObject({
        hasIntroduction: false,
        requiresSupervisor: true,
        canManageMaintenance: false,
      });
      expect(payload(b).resources[1]).toMatchObject({ canManageMaintenance: true });
      expect(payload(guest).resources[0]).not.toHaveProperty('hasIntroduction');
      expect(fixture.resourceUsageService.canControllResource).toHaveBeenCalledTimes(4);
      expect(fixture.resourceUsageService.getActiveSessions).toHaveBeenCalledTimes(1);
      expect(fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds).toHaveBeenCalledTimes(2);
      expect(fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        [10, 20],
        expect.any(Set),
      );
    });

    it('discards personalized results if another card arrives during authorization', async () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1 } });
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      fixture.resourceUsageService.canControllResource.mockImplementation(async () => {
        socket.state.lastAuthenticatedUserId = 2;
        return true;
      });
      await fixture.service.sendResourceListToSocket(socket);
      expect(socket.sendMessage).not.toHaveBeenCalled();
    });

    it('correlates explicit refreshes and versions snapshots before asynchronous work', async () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1 } });
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      let release: () => void;
      const held = new Promise<boolean>((resolve) => {
        release = () => resolve(false);
      });
      fixture.resourceUsageService.canControllResource.mockReturnValueOnce(held).mockResolvedValue(true);
      const oldBroadcast = fixture.service.sendResourceListToSocket(socket);
      // Advance through reader/user/permission awaits to the held authorization.
      while (!fixture.resourceUsageService.canControllResource.mock.calls.length) await Promise.resolve();
      await fixture.service.sendResourceListToSocket(socket, { requestId: 880 });
      release();
      await oldBroadcast;
      const [fresh, old] = socket.sendMessage.mock.calls.map(([event]) => event.data.payload);
      expect(fresh).toMatchObject({ requestId: 880, revision: 2 });
      expect(old.revision).toBe(1);
      expect(old).not.toHaveProperty('requestId');
    });

    it('fails closed for a deleted user', async () => {
      const socket = fixture.createMockSocket({ state: { lastAuthenticatedUserId: 1 } });
      fixture.attractapService.findReaderById.mockResolvedValue(fixture.createReaderFixture());
      (fixture.service as any).usersService.findOne.mockResolvedValue(null);
      await fixture.service.sendResourceListToSocket(socket);
      const payload = socket.sendMessage.mock.calls[0][0].data.payload;
      expect(payload.authenticatedUsername).toBe('');
      expect(payload.resources[0]).not.toHaveProperty('hasIntroduction');
    });
  });
}
