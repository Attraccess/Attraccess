import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { MqttWaitForMessageExecutor } from './mqtt-wait-for-message.executor';
import { MqttClientService } from '../../../mqtt/mqtt-client.service';
import { MqttMessageEvent } from '../../../mqtt/mqtt-message.event';

describe('MqttWaitForMessageExecutor', () => {
  let executor: MqttWaitForMessageExecutor;
  let mqttClientService: { subscribe: jest.Mock };
  let eventEmitter: EventEmitter2;

  function makeNode(data: object): ResourceFlowNode {
    return {
      id: 'n1',
      type: ResourceFlowNodeType.PROCESSING_MQTT_WAIT_FOR_MESSAGE,
      resourceId: 1,
      data,
    } as unknown as ResourceFlowNode;
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mqttClientService = { subscribe: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = new EventEmitter2();
    executor = new MqttWaitForMessageExecutor(
      mqttClientService as unknown as MqttClientService,
      eventEmitter,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('subscribes with serverId, topic and QoS then resolves when a matching event is emitted', async () => {
    const node = makeNode({ serverId: 7, topic: 'sensors/+/temp', timeoutSeconds: 30, subscribeQos: 1 });

    const promise = executor.execute(node);

    // allow subscribe() promise + listener registration to settle
    await Promise.resolve();
    await Promise.resolve();

    expect(mqttClientService.subscribe).toHaveBeenCalledWith(7, 'sensors/+/temp', 1);

    eventEmitter.emit(
      MqttMessageEvent.EVENT_NAME,
      new MqttMessageEvent(7, 'sensors/kitchen/temp', { value: 21 }),
    );

    await expect(promise).resolves.toEqual({
      payload: { topic: 'sensors/kitchen/temp', payload: { value: 21 } },
    });

    // listener cleaned up after resolution
    expect(eventEmitter.listenerCount(MqttMessageEvent.EVENT_NAME)).toBe(0);
  });

  it('ignores events with a non-matching serverId', async () => {
    const node = makeNode({ serverId: 7, topic: 'a/b', timeoutSeconds: 30, subscribeQos: 0 });

    const promise = executor.execute(node);
    await Promise.resolve();
    await Promise.resolve();

    // wrong serverId -> ignored
    eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(8, 'a/b', 'nope'));
    // matching serverId + topic -> resolves
    eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(7, 'a/b', 'yes'));

    await expect(promise).resolves.toEqual({ payload: { topic: 'a/b', payload: 'yes' } });
  });

  it('ignores events whose topic does not match the filter', async () => {
    const node = makeNode({ serverId: 7, topic: 'a/+', timeoutSeconds: 30, subscribeQos: 0 });

    const promise = executor.execute(node);
    await Promise.resolve();
    await Promise.resolve();

    // topic does not match a/+ (two levels)
    eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(7, 'a/b/c', 'nope'));
    // matching topic -> resolves
    eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(7, 'a/b', 'yes'));

    await expect(promise).resolves.toEqual({ payload: { topic: 'a/b', payload: 'yes' } });
  });

  it('rejects with a timeout error after timeoutSeconds and cleans up the listener', async () => {
    jest.useFakeTimers();
    const node = makeNode({ serverId: 7, topic: 'a/b', timeoutSeconds: 5, subscribeQos: 0 });

    const promise = executor.execute(node);
    const assertion = expect(promise).rejects.toThrow(
      "Timeout waiting for MQTT message on topic 'a/b' (server 7)",
    );

    // let subscribe() + listener registration settle before advancing timers
    await Promise.resolve();
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(5000);

    await assertion;
    expect(eventEmitter.listenerCount(MqttMessageEvent.EVENT_NAME)).toBe(0);
  });

  it('propagates and logs the error when subscribe rejects', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error');
    const subscribeError = new Error('broker unreachable');
    mqttClientService.subscribe.mockRejectedValue(subscribeError);

    const node = makeNode({ serverId: 9, topic: 'x/y', timeoutSeconds: 30, subscribeQos: 2 });

    await expect(executor.execute(node)).rejects.toThrow('broker unreachable');

    expect(mqttClientService.subscribe).toHaveBeenCalledWith(9, 'x/y', 2);
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to subscribe for wait node to topic x/y on server 9',
      subscribeError.stack,
    );
    // no listener should have been registered when subscribe failed
    expect(eventEmitter.listenerCount(MqttMessageEvent.EVENT_NAME)).toBe(0);
  });

  it('distinguishes acknowledgement timeouts from subscription failures', () => {
    expect(executor.getFailureKind(new Error("Timeout waiting for MQTT message on topic 'a/b' (server 7)"))).toBe(
      'acknowledgement-timeout',
    );
    expect(executor.getFailureKind(new Error('broker unreachable'))).toBe('transport-dispatch');
  });
});
