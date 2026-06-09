import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { MqttSendMessageExecutor } from './mqtt-send-message.executor';
import { NodeExecutionContext } from './node-executor.interface';

describe('MqttSendMessageExecutor', () => {
  let executor: MqttSendMessageExecutor;
  let mqttClientService: { publish: jest.Mock };
  let ctx: NodeExecutionContext;

  const makeNode = (data: Record<string, unknown>): ResourceFlowNode =>
    ({
      id: 'n1',
      type: ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE,
      resourceId: 1,
      data,
    } as unknown as ResourceFlowNode);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mqttClientService = { publish: jest.fn().mockResolvedValue(undefined) };

    ctx = {
      transactionManager: undefined,
      compileTemplate: jest.fn((tpl: string) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;

    executor = new MqttSendMessageExecutor(mqttClientService as unknown as MqttClientService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compiles topic and payload and publishes with qos and retain', async () => {
    const node = makeNode({
      serverId: 42,
      topic: 'sensors/{{id}}',
      payload: 'value-{{v}}',
      qos: 2,
      retain: true,
    });
    const input = { id: 7, v: 'on' };

    const result = await executor.execute(node, input, ctx);

    // topic and payload are both compiled against the input
    expect(ctx.compileTemplate).toHaveBeenNthCalledWith(1, 'sensors/{{id}}', input);
    expect(ctx.compileTemplate).toHaveBeenNthCalledWith(2, 'value-{{v}}', input);

    expect(mqttClientService.publish).toHaveBeenCalledTimes(1);
    expect(mqttClientService.publish).toHaveBeenCalledWith(42, 'sensors/{{id}}', 'value-{{v}}', {
      qos: 2,
      retain: true,
    });

    expect(result).toEqual({ payload: input });
  });

  it('uses the compiled output of compileTemplate as the published topic/payload', async () => {
    (ctx.compileTemplate as jest.Mock).mockImplementation((tpl: string, data: { name?: string }) =>
      tpl.replace('{{name}}', data.name ?? ''),
    );
    const node = makeNode({
      serverId: 1,
      topic: 'devices/{{name}}',
      payload: 'hello {{name}}',
      qos: 1,
      retain: false,
    });
    const input = { name: 'lamp' };

    await executor.execute(node, input, ctx);

    expect(mqttClientService.publish).toHaveBeenCalledWith(1, 'devices/lamp', 'hello lamp', {
      qos: 1,
      retain: false,
    });
  });

  it('defaults payload to empty string when payload is undefined', async () => {
    const node = makeNode({
      serverId: 3,
      topic: 'topic/x',
      qos: 0,
      retain: false,
    });
    const input = { foo: 'bar' };

    await executor.execute(node, input, ctx);

    // payload undefined -> compileTemplate called with ''
    expect(ctx.compileTemplate).toHaveBeenNthCalledWith(2, '', input);
    expect(mqttClientService.publish).toHaveBeenCalledWith(3, 'topic/x', '', {
      qos: 0,
      retain: false,
    });
  });

  it('defaults topic to empty string when topic is undefined', async () => {
    const node = makeNode({
      serverId: 9,
      payload: 'p',
    });
    const input = {};

    await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).toHaveBeenNthCalledWith(1, '', input);
    expect(mqttClientService.publish).toHaveBeenCalledWith(9, '', 'p', {
      qos: undefined,
      retain: undefined,
    });
  });

  it('passes undefined qos and retain through when not provided', async () => {
    const node = makeNode({
      serverId: 5,
      topic: 't',
      payload: 'p',
    });

    await executor.execute(node, {}, ctx);

    expect(mqttClientService.publish).toHaveBeenCalledWith(5, 't', 'p', {
      qos: undefined,
      retain: undefined,
    });
  });

  it('returns the original input unchanged as payload', async () => {
    const input = { nested: { a: 1 }, list: [1, 2, 3] };
    const node = makeNode({ serverId: 1, topic: 't', payload: 'p' });

    const result = await executor.execute(node, input, ctx);

    expect(result).toEqual({ payload: input });
    expect(result.payload).toBe(input);
  });

  it('propagates errors thrown by the mqtt client publish', async () => {
    const err = new Error('broker offline');
    mqttClientService.publish.mockRejectedValue(err);
    const node = makeNode({ serverId: 1, topic: 't', payload: 'p' });

    await expect(executor.execute(node, {}, ctx)).rejects.toThrow('broker offline');
  });
});
