import { registerSendUserRetrainingEmailSetsIsAgeTrueForAgeReason } from './email.service.send-user-retraining-email-sets-is-age-true-for-age-reason.test-cases';
import { registerSendUserRetrainingEmailSetsIsInactivityTrueForInactivityReason } from './email.service.send-user-retraining-email-sets-is-inactivity-true-for-inactivity-reason.test-cases';
import { registerSendUserRetrainingEmailSetsBothFlagsFalseForNullReason } from './email.service.send-user-retraining-email-sets-both-flags-false-for-null-reason.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { EmailServiceTestScope } from './email.service.spec';

export function defineSendUserRetrainingEmailTests(parentScope: EmailServiceTestScope) {
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
  registerSendUserRetrainingEmailSetsIsAgeTrueForAgeReason(scope);

  registerSendUserRetrainingEmailSetsIsInactivityTrueForInactivityReason(scope);

  registerSendUserRetrainingEmailSetsBothFlagsFalseForNullReason(scope);

  return scope;
}
