import * as mqtt from 'mqtt';
import { defineMqttClientServiceTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests';
// Interface to access private members for testing
// Mock mqtt module thoroughly to avoid actual connections and timers
jest.mock('mqtt', () => {
  const { EventEmitter } = require('events');

  function createMockClient() {
    const emitter = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = {
      connected: true,
      connecting: false,
      reconnecting: false,
      on: emitter.on.bind(emitter),
      once: emitter.once.bind(emitter),
      removeListener: emitter.removeListener.bind(emitter),
      end: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publish: jest.fn((topic: string, message: string, optsOrCb: any, cb?: any) => {
        const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
        if (typeof callback === 'function') {
          callback();
        }
      }),
      subscribe: jest.fn(
        (
          topic: string,
          optsOrCb: mqtt.IClientSubscribeOptions | ((error?: Error) => void),
          cb?: (error?: Error) => void,
        ) => {
          const callback = typeof optsOrCb === 'function' ? optsOrCb : cb;
          if (typeof callback === 'function') {
            callback();
          }
        },
      ),
      unsubscribe: jest.fn((topic: string, cb?: (error?: Error) => void) => {
        if (typeof cb === 'function') {
          cb();
        }
      }),
      emit: emitter.emit.bind(emitter),
    };
    // Simulate successful connect asynchronously
    setImmediate(() => client.emit('connect'));
    return client;
  }

  return {
    connect: jest.fn(() => createMockClient()),
  };
});

describe('MqttClientService', () => {
  defineMqttClientServiceTests();
});
export { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';
export {
  defineMqttClientServiceTests,
  MqttClientServiceTestScope,
  defineUnsubscribeTests,
  defineRefreshConnectionTests,
  definePublishTests,
  defineSubscribeTests,
  defineConnectionOwnershipTests,
  defineTlsOptionsTests,
} from './mqtt-client.service.spec.define-mqtt-client-service-tests';
export { UnsubscribeTestScope } from './mqtt-client.service.spec.unsubscribe-test-scope';
export { RefreshConnectionTestScope } from './mqtt-client.service.spec.refresh-connection-test-scope';
export { PublishTestScope } from './mqtt-client.service.spec.publish-test-scope';
export { SubscribeTestScope } from './mqtt-client.service.spec.subscribe-test-scope';
export { ConnectionOwnershipTestScope } from './mqtt-client.service.spec.connection-ownership-test-scope';
export { TlsOptionsTestScope } from './mqtt-client.service.spec.tls-options-test-scope';
