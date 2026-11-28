import { createWagoCommandNode } from './command-node';
import { WagoService } from '../controllers/service';

describe('createWagoCommandNode', () => {
  it('forwards the shared validation context to the WAGO service', async () => {
    const validateCommandConfig = jest.fn().mockResolvedValue([]);
    const validationContext = new Map<string, unknown>();
    const node = createWagoCommandNode(() => ({ validateCommandConfig }) as unknown as WagoService);

    await node.validateConfig?.({ controllerId: 1 }, validationContext);

    expect(validateCommandConfig).toHaveBeenCalledWith({ controllerId: 1 }, validationContext);
  });

  it('continues only on the output handle after the command succeeded', async () => {
    const executeCommand = jest.fn().mockResolvedValue(undefined);
    const node = createWagoCommandNode(() => ({ executeCommand }) as unknown as WagoService);
    const input = { usage: 1 };

    const result = await node.execute({ id: 'n', type: node.type, data: { controllerId: 1 } }, input, {} as never);

    // The host follows every edge, including "failure", when a result carries no handle.
    expect(result).toEqual({ payload: input, outputHandle: 'output' });
    expect(executeCommand).toHaveBeenCalledWith({ controllerId: 1 });
  });
});
