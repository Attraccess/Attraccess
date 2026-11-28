/* eslint-disable @typescript-eslint/no-explicit-any */
import { LicenseError } from '../../../../license/license.service';
import { registerResourceListServiceFixture } from './service.test-fixture';

// "Report a problem" and the "Is the machine OK?" check on the reader follow these per-card flags.
describe('ResourceListService maintenance flags', () => {
  const fixture = registerResourceListServiceFixture();

  async function listFor(userId: number | null) {
    const socket = fixture.createMockSocket(userId == null ? {} : { state: { verifiedUserId: userId } });
    fixture.websocketService.sockets.set(socket.id, socket);
    fixture.attractapService.findReaderById.mockResolvedValue(
      fixture.createReaderFixture({
        resources: [
          { id: 10, name: 'A asks', askMaintenanceCheckOnSessionEnd: true },
          { id: 20, name: 'B does not ask', askMaintenanceCheckOnSessionEnd: false },
          { id: 30, name: 'C maintained by the card holder', askMaintenanceCheckOnSessionEnd: true },
        ],
      }),
    );
    fixture.resourceMaintenanceService.getMaintenanceManagedResourceIds.mockResolvedValue(new Set([30]));
    await fixture.service.sendResourceList(42);
    return socket.sendMessage.mock.calls.at(-1)[0].data.payload.resources as any[];
  }

  const flags = (resources: any[]) =>
    resources.map(({ canRequestMaintenance, askMaintenanceCheckOnEnd }) => [
      canRequestMaintenance,
      askMaintenanceCheckOnEnd,
    ]);

  it('lets everybody but its maintainers request maintenance, and asks where the resource does', async () => {
    expect(flags(await listFor(1))).toEqual([
      [true, true],
      [true, false],
      [false, false],
    ]);
  });

  it('offers neither without the maintenance license', async () => {
    fixture.licenseService.verifyLicense.mockRejectedValue(new LicenseError('no maintenance module'));
    expect(flags(await listFor(1))).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
    expect(fixture.licenseService.verifyLicense).toHaveBeenCalledWith({ modules: ['maintenance'] });
  });

  it('offers neither on a machine the card holder may not see, like the web', async () => {
    fixture.listVisibility.filterVisible.mockImplementation(async (viewer, resourceIds: number[]) => {
      expect(viewer).toEqual({ id: 1, effectivePermissions: expect.any(Set) });
      return resourceIds.filter((id) => id !== 10);
    });
    expect(flags(await listFor(1))).toEqual([
      [false, false],
      [true, false],
      [false, false],
    ]);
  });

  it('sends no flags and checks no license while nobody is signed in', async () => {
    const [first] = await listFor(null);
    expect(first).not.toHaveProperty('canRequestMaintenance');
    expect(first).not.toHaveProperty('askMaintenanceCheckOnEnd');
    expect(fixture.licenseService.verifyLicense).not.toHaveBeenCalled();
  });
});
