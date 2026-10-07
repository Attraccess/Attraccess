import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerRevokesAndRemovesAnEnrollmentSessionWithoutRetainingItsRecords(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('revokes and removes an enrollment session without retaining its records', async () => {
    const session = { id: 1, enrollmentId: 2 } as WagoCommissioningSession;
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(session),
      delete: jest.fn(),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const wago = {
      registerCommissioningDiscoveryHandler: jest.fn(),
      revokeEnrollmentById: jest.fn().mockResolvedValue(undefined),
      deleteEnrollmentById: jest.fn().mockResolvedValue(undefined),
    } as unknown as WagoService;
    const service = new WagoCommissioningService(context, wago);
    service.onApplicationBootstrap();

    await service.remove(session.id);

    expect(wago.revokeEnrollmentById).toHaveBeenCalledWith(session.enrollmentId, expect.any(Function));
    expect(wago.deleteEnrollmentById).toHaveBeenCalledWith(session.enrollmentId, expect.any(Function));
    expect(repository.delete).toHaveBeenCalledWith(session.id);
  });
}
