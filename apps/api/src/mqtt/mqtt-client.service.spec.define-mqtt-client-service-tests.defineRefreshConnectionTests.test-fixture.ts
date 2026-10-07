import { Logger } from '@nestjs/common';
import { registerRefreshConnectionUsesCurrentAddressCredentialsAndTlsSettingsPreservingSharedSubscriptionsAndRejectingLate } from './mqtt-client.service.refresh-connection-uses-current-address-credentials-and-tls-settings-preserving-shared-subscriptions-and-rejecting-late.test-cases';
import { registerRefreshConnectionKeepsReconnectingAfterRefreshTimesOutAndRestoresExistingSubscriptionsWhenTheBrokerRecov } from './mqtt-client.service.refresh-connection-keeps-reconnecting-after-refresh-times-out-and-restores-existing-subscriptions-when-the-broker-recov.test-cases';
import { registerRefreshConnectionReplacesAnUnreachablePendingClientWithoutWaitingForThePreviousBrokerAndPreventsItFrom } from './mqtt-client.service.refresh-connection-replaces-an-unreachable-pending-client-without-waiting-for-the-previous-broker-and-prevents-it-from-.test-cases';
import { MqttClientServicePrivate } from './mqtt-client.service.spec.mqtt-client-service-private';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export function defineRefreshConnectionTests(parentScope: MqttClientServiceTestScope) {
  function useRealConnections() {
    jest.restoreAllMocks();
    for (const level of ['log', 'error', 'debug', 'warn'] as const)
      jest.spyOn(Logger.prototype, level).mockImplementation(jest.fn());
    return parentScope.service as unknown as MqttClientServicePrivate;
  }
  const scope = inheritTestScope(
    {
      get useRealConnections() {
        return useRealConnections;
      },
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get mockRepository() {
        return parentScope.mockRepository;
      },
      set mockRepository(value: typeof parentScope.mockRepository) {
        parentScope.mockRepository = value;
      },
      get mockServer() {
        return parentScope.mockServer;
      },
      get mockEventEmitter() {
        return parentScope.mockEventEmitter;
      },
      set mockEventEmitter(value: typeof parentScope.mockEventEmitter) {
        parentScope.mockEventEmitter = value;
      },
      get mockMetricsService() {
        return parentScope.mockMetricsService;
      },
      set mockMetricsService(value: typeof parentScope.mockMetricsService) {
        parentScope.mockMetricsService = value;
      },
    },
    parentScope,
  );

  registerRefreshConnectionUsesCurrentAddressCredentialsAndTlsSettingsPreservingSharedSubscriptionsAndRejectingLate(
    scope,
  );

  registerRefreshConnectionKeepsReconnectingAfterRefreshTimesOutAndRestoresExistingSubscriptionsWhenTheBrokerRecov(
    scope,
  );

  registerRefreshConnectionReplacesAnUnreachablePendingClientWithoutWaitingForThePreviousBrokerAndPreventsItFrom(scope);

  return scope;
}
