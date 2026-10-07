import { registerSendResourceUsageNoteEmailSetsIsStartTrueForStartPhase } from './email.service.send-resource-usage-note-email-sets-is-start-true-for-start-phase.test-cases';
import { registerSendResourceUsageNoteEmailSetsIsStartFalseForEndPhase } from './email.service.send-resource-usage-note-email-sets-is-start-false-for-end-phase.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { EmailServiceTestScope } from './email.service.spec';

export function defineSendResourceUsageNoteEmailTests(parentScope: EmailServiceTestScope) {
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
  registerSendResourceUsageNoteEmailSetsIsStartTrueForStartPhase(scope);

  registerSendResourceUsageNoteEmailSetsIsStartFalseForEndPhase(scope);

  return scope;
}
