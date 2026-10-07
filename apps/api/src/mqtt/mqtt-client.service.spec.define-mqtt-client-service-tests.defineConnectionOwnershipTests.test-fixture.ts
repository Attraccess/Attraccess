import { Logger } from '@nestjs/common';
import { registerConnectionOwnershipSharesTheReconnectingClientBetweenConcurrentCallersInsteadOfCreatingADuplicateIdentity } from './mqtt-client.service.connection-ownership-shares-the-reconnecting-client-between-concurrent-callers-instead-of-creating-a-duplicate-identity.test-cases';
import { registerConnectionOwnershipBoundsReconnectWaitsWithoutReplacingOrStoppingTheClient } from './mqtt-client.service.connection-ownership-bounds-reconnect-waits-without-replacing-or-stopping-the-client.test-cases';
import { registerConnectionOwnershipRetainsAFailedRefreshConnectionForLaterCallersWhileItContinuesReconnecting } from './mqtt-client.service.connection-ownership-retains-a-failed-refresh-connection-for-later-callers-while-it-continues-reconnecting.test-cases';
import { registerConnectionOwnershipRejectsAReconnectWaiterWhenRefreshingAndIgnoresLateEventsFromTheRetiredClient } from './mqtt-client.service.connection-ownership-rejects-a-reconnect-waiter-when-refreshing-and-ignores-late-events-from-the-retired-client.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export function defineConnectionOwnershipTests(parentScope: MqttClientServiceTestScope) {
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
    },
    parentScope,
  );

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(jest.fn());
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  });

  afterEach(() => jest.useRealTimers());
  registerConnectionOwnershipSharesTheReconnectingClientBetweenConcurrentCallersInsteadOfCreatingADuplicateIdentity(
    scope,
  );

  registerConnectionOwnershipBoundsReconnectWaitsWithoutReplacingOrStoppingTheClient(scope);

  registerConnectionOwnershipRetainsAFailedRefreshConnectionForLaterCallersWhileItContinuesReconnecting(scope);

  registerConnectionOwnershipRejectsAReconnectWaiterWhenRefreshingAndIgnoresLateEventsFromTheRetiredClient(scope);

  return scope;
}
