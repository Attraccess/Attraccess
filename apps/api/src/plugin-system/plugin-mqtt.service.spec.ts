import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent } from '../mqtt/mqtt-message.event';
import { PluginMqttService, mqttTopicMatches } from './plugin-mqtt.service';

describe('mqttTopicMatches', () => {
  it.each([
    ['sensors/+', 'sensors/kitchen', true],
    ['sensors/+', 'sensors/kitchen/temperature', false],
    ['sensors/#', 'sensors/kitchen/temperature', true],
    ['sensors/#', 'sensors', true],
    ['sensors/#/temperature', 'sensors/kitchen/temperature', false],
    ['sensors/kitchen', 'sensors/bedroom', false],
    ['#', '$SYS/broker/uptime', false],
    ['+/broker/uptime', '$SYS/broker/uptime', false],
    ['$SYS/#', '$SYS/broker/uptime', true],
  ])('matches %s against %s: %s', (filter, topic, expected) => {
    expect(mqttTopicMatches(filter, topic)).toBe(expected);
  });
});

describe('PluginMqttService', () => {
  let events: EventEmitter2;
  let mqtt: { subscribe: jest.Mock; unsubscribe: jest.Mock; publish: jest.Mock };
  let service: PluginMqttService;

  beforeEach(() => {
    events = new EventEmitter2();
    mqtt = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn(),
    };
    service = new PluginMqttService(mqtt as never, events);
  });

  it('delivers only matching messages from the requested server', async () => {
    const handler = jest.fn();
    await service.subscribe('plugin-id', 'test-plugin', new Logger('Plugin:test-plugin'), 1, 'sensors/+', handler);

    events.emit(
      MqttMessageEvent.EVENT_NAME,
      new MqttMessageEvent(2, 'sensors/kitchen', {}, Buffer.from('wrong-server')),
    );
    events.emit(
      MqttMessageEvent.EVENT_NAME,
      new MqttMessageEvent(1, 'sensors/kitchen/temp', {}, Buffer.from('wrong-topic')),
    );
    events.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(1, 'sensors/kitchen', {}, Buffer.from('delivered')));
    await new Promise(setImmediate);

    expect(handler).toHaveBeenCalledWith({ serverId: 1, topic: 'sensors/kitchen', payload: Buffer.from('delivered') });
  });

  it('waits for broker subscription acknowledgement', async () => {
    let acknowledge!: () => void;
    mqtt.subscribe.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );

    const subscription = service.subscribe(
      'plugin-id',
      'test-plugin',
      new Logger('Plugin:test-plugin'),
      1,
      'events/#',
      () => undefined,
    );
    await Promise.resolve();

    expect(mqtt.subscribe).toHaveBeenCalledWith(1, 'events/#', undefined, true);
    await expect(Promise.race([subscription, Promise.resolve('pending')])).resolves.toBe('pending');

    acknowledge();
    await expect(subscription).resolves.toEqual({ unsubscribe: expect.any(Function) });
  });

  it('does not release a shared topic twice when teardown races with a failed acknowledgement', async () => {
    let rejectAcknowledgement!: (error: Error) => void;
    await service.subscribe('live', 'live', new Logger('Plugin:live'), 1, 'events/#', () => undefined);
    mqtt.subscribe.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAcknowledgement = reject;
        }),
    );

    const pending = service.subscribe(
      'pending',
      'pending',
      new Logger('Plugin:pending'),
      1,
      'events/#',
      () => undefined,
    );
    await Promise.resolve();

    service.clearPlugin('pending');
    rejectAcknowledgement(new Error('broker rejected subscription'));

    await expect(pending).rejects.toThrow('broker rejected subscription');
    expect(mqtt.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mqtt.unsubscribe).toHaveBeenCalledWith(1, 'events/#');
  });

  it('logs a throwing handler and continues delivering to other subscribers', async () => {
    const logger = new Logger('Plugin:broken');
    const logError = jest.spyOn(logger, 'error').mockImplementation();
    const working = jest.fn();
    await service.subscribe('broken', 'broken', logger, 1, 'events/#', () => {
      throw new Error('broken handler');
    });
    await service.subscribe('working', 'working', new Logger('Plugin:working'), 1, 'events/#', working);

    events.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(1, 'events/open', {}, Buffer.from('message')));
    await new Promise(setImmediate);

    expect(logError).toHaveBeenCalledWith('MQTT handler for "events/#" failed', expect.any(String));
    expect(working).toHaveBeenCalled();
  });

  it('gives every subscriber an isolated payload buffer', async () => {
    const mutatingHandler = jest.fn(({ payload }: { payload: Buffer }) => {
      payload.fill(0);
    });
    const receivingHandler = jest.fn();
    await service.subscribe('mutating', 'mutating', new Logger('Plugin:mutating'), 1, 'events/#', mutatingHandler);
    await service.subscribe('receiving', 'receiving', new Logger('Plugin:receiving'), 1, 'events/#', receivingHandler);

    events.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(1, 'events/open', {}, Buffer.from('message')));
    await new Promise(setImmediate);

    expect(receivingHandler).toHaveBeenCalledWith({
      serverId: 1,
      topic: 'events/open',
      payload: Buffer.from('message'),
    });
  });

  it('serializes handler execution and drops new messages when its queue is full', async () => {
    const logger = new Logger('Plugin:slow');
    const logWarn = jest.spyOn(logger, 'warn').mockImplementation();
    let releaseHandler!: () => void;
    const handler = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseHandler = resolve;
        }),
    );
    await service.subscribe('slow', 'slow', logger, 1, 'events/#', handler);

    for (let index = 0; index < 102; index++) {
      events.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(1, `events/${index}`, {}, Buffer.from('message')));
    }
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith('MQTT handler queue for "events/#" is full; dropping new messages');

    releaseHandler();
    await new Promise(setImmediate);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not clone payloads dropped from a full queue', async () => {
    let releaseHandler!: () => void;
    const subscription = await service.subscribe(
      'slow',
      'slow',
      new Logger('Plugin:slow'),
      1,
      'events/#',
      () =>
        new Promise<void>((resolve) => {
          releaseHandler = resolve;
        }),
    );
    const payload = Buffer.from('message');
    const clonePayload = jest.spyOn(Buffer, 'from');

    try {
      for (let index = 0; index < 102; index++) {
        events.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(1, `events/${index}`, {}, payload));
      }
      await Promise.resolve();

      // Nest's overflow logger also converts its formatted string with Buffer.from.
      // Count copies of the source payload: one active delivery and 100 queued messages.
      expect(clonePayload.mock.calls.filter(([value]) => value === payload)).toHaveLength(101);
    } finally {
      clonePayload.mockRestore();
      subscription.unsubscribe();
      releaseHandler();
    }
  });

  it('releases every plugin subscription to the shared MQTT client', async () => {
    const first = await service.subscribe('one', 'one', new Logger('Plugin:one'), 1, 'events/#', () => undefined);
    const second = await service.subscribe('two', 'two', new Logger('Plugin:two'), 1, 'events/#', () => undefined);

    first.unsubscribe();
    second.unsubscribe();
    await new Promise(setImmediate);

    expect(mqtt.unsubscribe).toHaveBeenCalledTimes(2);
    expect(mqtt.unsubscribe).toHaveBeenLastCalledWith(1, 'events/#');
  });

  it('tears down all subscriptions for a destroyed plugin', async () => {
    await service.subscribe('plugin-id', 'test-plugin', new Logger('Plugin:test-plugin'), 1, 'one', () => undefined);
    await service.subscribe('plugin-id', 'test-plugin', new Logger('Plugin:test-plugin'), 1, 'two', () => undefined);

    service.clearPlugin('plugin-id');
    await Promise.resolve();

    expect(mqtt.unsubscribe).toHaveBeenCalledWith(1, 'one');
    expect(mqtt.unsubscribe).toHaveBeenCalledWith(1, 'two');
  });

  it('preserves binary publish payloads', async () => {
    const payload = Buffer.from([0, 255, 1]);

    await service.publish(1, 'binary', payload, { qos: 2, retain: true });

    expect(mqtt.publish).toHaveBeenCalledWith(1, 'binary', payload, { qos: 2, retain: true });
  });
});
