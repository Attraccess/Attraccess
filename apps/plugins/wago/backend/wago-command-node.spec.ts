import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { createWagoCommandNode } from './wago-command-node';
import { WagoService } from './wago.service';

describe('createWagoCommandNode', () => {
  it('forwards the shared validation context to the WAGO service', async () => {
    const validateCommandConfig = jest.fn().mockResolvedValue([]);
    const context = {
      get: jest.fn().mockReturnValue({ validateCommandConfig } as unknown as WagoService),
    } as unknown as PluginContext;
    const validationContext = new Map<string, unknown>();
    const node = createWagoCommandNode(context);

    await node.validateConfig?.({ controllerId: 1 }, validationContext);

    expect(validateCommandConfig).toHaveBeenCalledWith({ controllerId: 1 }, validationContext);
  });
});
