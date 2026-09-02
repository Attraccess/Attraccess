import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoCommissioningService } from './wago-commissioning.service';
import { WagoService } from './wago.service';

describe('WagoCommissioningService', () => {
  it('defers repository access until plugin module initialization', () => {
    const repository = {};
    const context = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as PluginContext;

    const service = new WagoCommissioningService(context, {} as WagoService);

    expect(context.getRepository).not.toHaveBeenCalled();

    service.onModuleInit();

    expect(context.getRepository).toHaveBeenCalledWith(WagoCommissioningSession);
  });
});
