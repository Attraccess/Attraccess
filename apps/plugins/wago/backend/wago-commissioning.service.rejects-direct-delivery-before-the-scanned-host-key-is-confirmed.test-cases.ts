import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerRejectsDirectDeliveryBeforeTheScannedHostKeyIsConfirmed(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('rejects direct delivery before the scanned host key is confirmed', async () => {
    const session = { id: 1, state: 'awaiting_identity_confirmation' } as WagoCommissioningSession;
    const repository = { findOneBy: jest.fn().mockResolvedValue(session) };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    service.onApplicationBootstrap();

    await expect(service.deliver(session.id)).rejects.toThrow('cannot be delivered in its current state');
  });
}
