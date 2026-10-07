import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';
import type { WagoCommissioningServiceTestScope } from './wago-commissioning.service.spec';
export function registerDefersRepositoryAccessUntilPluginModuleInitialization(
  _scope: WagoCommissioningServiceTestScope,
): void {
  it('defers repository access until plugin module initialization', async () => {
    const repository = { find: jest.fn().mockResolvedValue([]) };
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as PluginContext;

    const service = new WagoCommissioningService(context, {
      registerCommissioningDiscoveryHandler: jest.fn(),
    } as unknown as WagoService);

    expect(context.getRepository).not.toHaveBeenCalled();

    await service.onApplicationBootstrap();

    expect(context.getRepository).toHaveBeenCalledWith(WagoCommissioningSession);
  });
}
