import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerDoesNotExposeStoredCommissioningVerifiersInSessionLists(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('does not expose stored commissioning verifiers in session lists', async () => {
    const repository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 1, controllerName: 'Boiler room', pairingCode: '482931' } as WagoCommissioningSession,
        ]),
    };
    const context = { getRepository: jest.fn().mockReturnValue(repository) } as unknown as PluginContext;
    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);
    service['sessions'] = repository as never;

    const [listed] = await service.list();

    expect(listed).toEqual({ id: 1, controllerName: 'Boiler room', operationDeadlineAt: null });
    expect(listed).not.toHaveProperty('pairingCode');
  });
}
