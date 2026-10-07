import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerRequiresTheAdministratorToConfirmTheScannedHostKeyBeforeDelivery(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('requires the administrator to confirm the scanned host key before delivery', async () => {
    const session = {
      id: 1,
      hostKeyFingerprint: 'SHA256:test',
      state: 'awaiting_identity_confirmation',
      progressPercent: 0,
      progressStep: 'Confirm controller identity',
      progressDetail: '',
      auditLog: '[]',
      updatedAt: '',
    } as WagoCommissioningSession;
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(session),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    service.onApplicationBootstrap();

    await expect(service.confirmHostKey(session.id, 'SHA256:other')).rejects.toThrow('does not match');
    await expect(service.confirmHostKey(session.id, session.hostKeyFingerprint)).resolves.toMatchObject({
      state: 'awaiting_delivery',
      progressStep: 'Identity confirmed',
    });
  });
}
