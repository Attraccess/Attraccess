import { registerSubscribeReSubscribesTrackedTopicsAfterReconnecting } from './mqtt-client.service.subscribe-re-subscribes-tracked-topics-after-reconnecting.test-cases';
import { registerSubscribeRecordsReconnectQoSOnlyAfterTheBrokerAcceptsTheSubscription } from './mqtt-client.service.subscribe-records-reconnect-qo-s-only-after-the-broker-accepts-the-subscription.test-cases';
import { registerSubscribePromotesASharedTopicToTheHighestRequestedQoS } from './mqtt-client.service.subscribe-promotes-a-shared-topic-to-the-highest-requested-qo-s.test-cases';
import { registerSubscribeRetainsAServerDefaultQoSThatIsHigherThanALaterRequest } from './mqtt-client.service.subscribe-retains-a-server-default-qo-s-that-is-higher-than-a-later-request.test-cases';
import { registerSubscribeRejectsAcknowledgementRequiredSubscriptionsWhenTheBrokerRejectsThem } from './mqtt-client.service.subscribe-rejects-acknowledgement-required-subscriptions-when-the-broker-rejects-them.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export function defineSubscribeTests(parentScope: MqttClientServiceTestScope) {
  const scope = inheritTestScope(
    {
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
    },
    parentScope,
  );
  registerSubscribeReSubscribesTrackedTopicsAfterReconnecting(scope);

  registerSubscribeRecordsReconnectQoSOnlyAfterTheBrokerAcceptsTheSubscription(scope);

  registerSubscribePromotesASharedTopicToTheHighestRequestedQoS(scope);

  registerSubscribeRetainsAServerDefaultQoSThatIsHigherThanALaterRequest(scope);

  registerSubscribeRejectsAcknowledgementRequiredSubscriptionsWhenTheBrokerRejectsThem(scope);

  return scope;
}
