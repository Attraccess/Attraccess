import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { CompanionGatewayService } from '../../../companion/companion-gateway.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { CompanionUnlockPcExecutor } from './companion-unlock-pc.executor';

function createNode(data: object): ResourceFlowNode {
  return {
    id: 'unlock-pc-1',
    type: ResourceFlowNodeType.OUTPUT_COMPANION_UNLOCK_PC,
    resourceId: 1,
    data,
  } as unknown as ResourceFlowNode;
}

describe('CompanionUnlockPcExecutor', () => {
  let executor: CompanionUnlockPcExecutor;
  let gateway: CompanionGatewayService;

  beforeEach(() => {
    gateway = {
      sendUnlockCommand: jest.fn(async () => true),
    } as unknown as CompanionGatewayService;

    executor = new CompanionUnlockPcExecutor(gateway);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls sendUnlockCommand with configured deviceId and merges delivered into payload', async () => {
    const node = createNode({ deviceId: 42 });
    const input = { foo: 'bar' };

    const result = await executor.execute(node, input);

    expect(gateway.sendUnlockCommand).toHaveBeenCalledWith(42);
    expect(result.payload).toMatchObject({ foo: 'bar', companion: { delivered: true } });
  });

  it('returns delivered: false when device is offline (no error thrown)', async () => {
    (gateway.sendUnlockCommand as jest.Mock).mockResolvedValue(false);
    const node = createNode({ deviceId: 7 });

    const result = await executor.execute(node, {});

    expect(result.payload).toMatchObject({ companion: { delivered: false } });
  });

  it('throws FlowExecutionError when node data is missing deviceId', async () => {
    const node = createNode({});

    await expect(executor.execute(node, {})).rejects.toBeInstanceOf(FlowExecutionError);
    expect(gateway.sendUnlockCommand).not.toHaveBeenCalled();
  });

  it('throws FlowExecutionError when node data is null', async () => {
    const node = { ...createNode({}), data: null };

    await expect(executor.execute(node, {})).rejects.toBeInstanceOf(FlowExecutionError);
  });

  it('throws FlowExecutionError when deviceId is not a positive integer', async () => {
    const node = createNode({ deviceId: 0 });

    await expect(executor.execute(node, {})).rejects.toBeInstanceOf(FlowExecutionError);
    expect(gateway.sendUnlockCommand).not.toHaveBeenCalled();
  });
});
