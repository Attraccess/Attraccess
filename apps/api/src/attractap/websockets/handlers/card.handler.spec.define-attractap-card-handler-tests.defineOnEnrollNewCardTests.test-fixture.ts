import { registerOnEnrollNewCardSendsEnrollNewCardDataNotSetWhenNoEnrollNewCardData } from './card.handler.on-enroll-new-card-sends-enroll-new-card-data-not-set-when-no-enroll-new-card-data.test-cases';
import { registerOnEnrollNewCardLogsErrorAndReturnsWithoutAMessageWhenPayloadSuccessIsFalse } from './card.handler.on-enroll-new-card-logs-error-and-returns-without-a-message-when-payload-success-is-false.test-cases';
import { registerOnEnrollNewCardSendsKeyNotSetWhenStoredDataHasNoKey } from './card.handler.on-enroll-new-card-sends-key-not-set-when-stored-data-has-no-key.test-cases';
import { registerOnEnrollNewCardSendsKeyNotSetWhenStoredDataHasNoKeyNo } from './card.handler.on-enroll-new-card-sends-key-not-set-when-stored-data-has-no-key-no.test-cases';
import { registerOnEnrollNewCardSendsUserNotFoundWhenTheUserDoesNotExist } from './card.handler.on-enroll-new-card-sends-user-not-found-when-the-user-does-not-exist.test-cases';
import { registerOnEnrollNewCardCreatesTheCardClearsStateAndSendsSuccess } from './card.handler.on-enroll-new-card-creates-the-card-clears-state-and-sends-success.test-cases';
import { registerOnEnrollNewCardAuditsWithTheEnrollmentPrincipalWhenCancellationClearsSocketStateDuringPersistence } from './card.handler.on-enroll-new-card-audits-with-the-enrollment-principal-when-cancellation-clears-socket-state-during-persistence.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function defineOnEnrollNewCardTests(parentScope: AttractapCardHandlerTestScope) {
  const scope = inheritTestScope(
    {
      get createMockSocket() {
        return parentScope.createMockSocket;
      },
      get handler() {
        return parentScope.handler;
      },
      set handler(value: typeof parentScope.handler) {
        parentScope.handler = value;
      },
      get usersService() {
        return parentScope.usersService;
      },
      set usersService(value: typeof parentScope.usersService) {
        parentScope.usersService = value;
      },
      get attractapService() {
        return parentScope.attractapService;
      },
      set attractapService(value: typeof parentScope.attractapService) {
        parentScope.attractapService = value;
      },
      get mockUser() {
        return parentScope.mockUser;
      },
      get audit() {
        return parentScope.audit;
      },
      set audit(value: typeof parentScope.audit) {
        parentScope.audit = value;
      },
    },
    parentScope,
  );
  registerOnEnrollNewCardSendsEnrollNewCardDataNotSetWhenNoEnrollNewCardData(scope);

  registerOnEnrollNewCardLogsErrorAndReturnsWithoutAMessageWhenPayloadSuccessIsFalse(scope);

  registerOnEnrollNewCardSendsKeyNotSetWhenStoredDataHasNoKey(scope);

  registerOnEnrollNewCardSendsKeyNotSetWhenStoredDataHasNoKeyNo(scope);

  registerOnEnrollNewCardSendsUserNotFoundWhenTheUserDoesNotExist(scope);

  registerOnEnrollNewCardCreatesTheCardClearsStateAndSendsSuccess(scope);

  registerOnEnrollNewCardAuditsWithTheEnrollmentPrincipalWhenCancellationClearsSocketStateDuringPersistence(scope);

  return scope;
}
