import { registerPublishShouldSuccessfullyPublishAMessage } from './mqtt-client.service.publish-should-successfully-publish-a-message.test-cases';
import { registerPublishShouldThrowAnErrorIfPublishingFails } from './mqtt-client.service.publish-should-throw-an-error-if-publishing-fails.test-cases';
import { registerPublishDoesNotWaitForThePublishCallbackWhenDispatchCompletionIsSelected } from './mqtt-client.service.publish-does-not-wait-for-the-publish-callback-when-dispatch-completion-is-selected.test-cases';
import { registerPublishShouldUseServerDefaultsWhenNoOptionsAreProvided } from './mqtt-client.service.publish-should-use-server-defaults-when-no-options-are-provided.test-cases';
import { registerPublishShouldPreferPerCallOptionsOverServerDefaults } from './mqtt-client.service.publish-should-prefer-per-call-options-over-server-defaults.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { MqttClientServiceTestScope } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export function definePublishTests(parentScope: MqttClientServiceTestScope) {
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get mockExternalCallTimer() {
        return parentScope.mockExternalCallTimer;
      },
      set mockExternalCallTimer(value: typeof parentScope.mockExternalCallTimer) {
        parentScope.mockExternalCallTimer = value;
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
  registerPublishShouldSuccessfullyPublishAMessage(scope);

  registerPublishShouldThrowAnErrorIfPublishingFails(scope);

  registerPublishDoesNotWaitForThePublishCallbackWhenDispatchCompletionIsSelected(scope);

  registerPublishShouldUseServerDefaultsWhenNoOptionsAreProvided(scope);

  registerPublishShouldPreferPerCallOptionsOverServerDefaults(scope);

  return scope;
}
