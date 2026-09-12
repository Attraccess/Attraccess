import { createWagoStateNodes } from './wago-state-nodes';
import { WagoFlowService } from './wago-flow.service';

describe('WAGO state flow nodes', () => {
  const state = { value: true };
  const read = jest.fn();
  const wait = jest.fn();
  const payload = jest.fn();
  const service = { read, wait, payload } as unknown as WagoFlowService;
  const nodes = createWagoStateNodes(() => service);

  async function execute(type: string) {
    const node = nodes.find((node) => node.type === `plugin.wago.${type}`);
    if (!node || node.isInput) throw new Error('Expected an execution node');
    return node.execute(
      { id: 'node', type: node.type, data: { controllerId: 1, channelId: 'door', category: 'state' } },
      { upstream: 'preserved' },
      { compileTemplate: (template) => template },
    );
  }

  beforeEach(() => jest.resetAllMocks());

  it('registers the event listener as a trigger with no input', () => {
    expect(nodes[0]).toMatchObject({
      type: 'plugin.wago.event-received',
      isInput: true,
      inputs: [],
      outputs: ['output'],
    });
  });

  it.each([true, false])('routes cached reads according to availability: %s', async (available) => {
    read.mockReturnValue(state);
    payload.mockReturnValue({ ...state, available });
    await expect(execute('read-state')).resolves.toEqual({
      payload: { upstream: 'preserved', wago: { value: true, available } },
      outputHandle: available ? 'output' : 'unavailable',
    });
  });

  it('routes a missing cached value to unavailable', async () => {
    read.mockReturnValue(null);
    await expect(execute('read-state')).resolves.toMatchObject({
      outputHandle: 'unavailable',
      payload: { wago: { available: false } },
    });
    expect(payload).not.toHaveBeenCalled();
  });

  it.each([true, false])('continues a wait on the matching state or timeout: %s', async (matched) => {
    wait.mockResolvedValue(matched ? state : null);
    payload.mockReturnValue({ ...state, available: true });
    await expect(execute('wait-for-state')).resolves.toEqual({
      payload: { upstream: 'preserved', wago: matched ? { value: true, available: true } : { available: false } },
      outputHandle: matched ? 'output' : 'timeout',
    });
  });
});
