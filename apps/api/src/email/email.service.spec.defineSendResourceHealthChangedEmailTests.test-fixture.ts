import { registerSendResourceHealthChangedEmailPassesIsDegradedTrueAndHeaderColorForUnhealthyStatus } from './email.service.send-resource-health-changed-email-passes-is-degraded-true-and-header-color-for-unhealthy-status.test-cases';
import { registerSendResourceHealthChangedEmailPassesIsDegradedFalseForHealthyStatus } from './email.service.send-resource-health-changed-email-passes-is-degraded-false-for-healthy-status.test-cases';
import { registerSendResourceHealthChangedEmailSkipsSendWhenUserHasNoEmail } from './email.service.send-resource-health-changed-email-skips-send-when-user-has-no-email.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { EmailServiceTestScope } from './email.service.spec';

export function defineSendResourceHealthChangedEmailTests(parentScope: EmailServiceTestScope) {
  const scope = inheritTestScope(
    {
      get setup() {
        return parentScope.setup;
      },
      get makeUser() {
        return parentScope.makeUser;
      },
    },
    parentScope,
  );
  registerSendResourceHealthChangedEmailPassesIsDegradedTrueAndHeaderColorForUnhealthyStatus(scope);

  registerSendResourceHealthChangedEmailPassesIsDegradedFalseForHealthyStatus(scope);

  registerSendResourceHealthChangedEmailSkipsSendWhenUserHasNoEmail(scope);

  return scope;
}
