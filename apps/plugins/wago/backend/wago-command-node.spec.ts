import { createWagoCommandNode } from './wago-command-node';
import { WagoService } from './wago.service';

describe('createWagoCommandNode', () => {
  it('forwards the shared validation context to the WAGO service', async () => {
    const validateCommandConfig = jest.fn().mockResolvedValue([]);
    const validationContext = new Map<string, unknown>();
    const node = createWagoCommandNode(() => ({ validateCommandConfig }) as unknown as WagoService);

    await node.validateConfig?.({ controllerId: 1 }, validationContext);

    expect(validateCommandConfig).toHaveBeenCalledWith({ controllerId: 1 }, validationContext);
  });
});
