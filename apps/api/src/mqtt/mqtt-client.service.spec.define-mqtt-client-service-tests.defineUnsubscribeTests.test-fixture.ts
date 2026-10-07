import { registerUnsubscribeKeepsASharedBrokerSubscriptionUntilItsFinalConsumerUnsubscribes } from './mqtt-client.service.unsubscribe-keeps-a-shared-broker-subscription-until-its-final-consumer-unsubscribes.test-cases';
import { registerUnsubscribeLowersASharedSubscriptionQoSWhenItsHighestQoSConsumerUnsubscribes } from './mqtt-client.service.unsubscribe-lowers-a-shared-subscription-qo-s-when-its-highest-qo-s-consumer-unsubscribes.test-cases';
import { registerUnsubscribePreservesTheBrokerQoSWhenLoweringTheSubscriptionIsRejected } from './mqtt-client.service.unsubscribe-preserves-the-broker-qo-s-when-lowering-the-subscription-is-rejected.test-cases';
import { registerUnsubscribeReconcilesAHigherQoSSubscriberAddedWhileALowerQoSUpdateIsPending } from './mqtt-client.service.unsubscribe-reconciles-a-higher-qo-s-subscriber-added-while-a-lower-qo-s-update-is-pending.test-cases';
import { registerUnsubscribeDoesNotReSubscribeAfterTheFinalConsumerUnsubscribesDuringTheServerLookup } from './mqtt-client.service.unsubscribe-does-not-re-subscribe-after-the-final-consumer-unsubscribes-during-the-server-lookup.test-cases';
import { registerUnsubscribeRemovesTheTopicFromReconnectSubscriptionsAndTheActiveClient } from './mqtt-client.service.unsubscribe-removes-the-topic-from-reconnect-subscriptions-and-the-active-client.test-cases';
import { registerUnsubscribeDoesNotSubscribeAfterAPendingConnectionIsUnsubscribed } from './mqtt-client.service.unsubscribe-does-not-subscribe-after-a-pending-connection-is-unsubscribed.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export function defineUnsubscribeTests(parentScope: MqttClientServiceTestScope) {
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get mockServer() {
        return parentScope.mockServer;
      },
      get mockRepository() {
        return parentScope.mockRepository;
      },
      set mockRepository(value: typeof parentScope.mockRepository) {
        parentScope.mockRepository = value;
      },
    },
    parentScope,
  );
  registerUnsubscribeKeepsASharedBrokerSubscriptionUntilItsFinalConsumerUnsubscribes(scope);

  registerUnsubscribeLowersASharedSubscriptionQoSWhenItsHighestQoSConsumerUnsubscribes(scope);

  registerUnsubscribePreservesTheBrokerQoSWhenLoweringTheSubscriptionIsRejected(scope);

  registerUnsubscribeReconcilesAHigherQoSSubscriberAddedWhileALowerQoSUpdateIsPending(scope);

  registerUnsubscribeDoesNotReSubscribeAfterTheFinalConsumerUnsubscribesDuringTheServerLookup(scope);

  registerUnsubscribeRemovesTheTopicFromReconnectSubscriptionsAndTheActiveClient(scope);

  registerUnsubscribeDoesNotSubscribeAfterAPendingConnectionIsUnsubscribed(scope);

  return scope;
}
