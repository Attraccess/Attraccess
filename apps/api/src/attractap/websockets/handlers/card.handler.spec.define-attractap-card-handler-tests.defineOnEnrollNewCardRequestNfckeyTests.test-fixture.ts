import { registerOnEnrollNewCardRequestNfckeySendsUserNotSetWhenNoEnrollmentIsActive } from './card.handler.on-enroll-new-card-request-nfckey-sends-user-not-set-when-no-enrollment-is-active.test-cases';
import { registerOnEnrollNewCardRequestNfckeySendsInvalidParamsWhenUidIsMissing } from './card.handler.on-enroll-new-card-request-nfckey-sends-invalid-params-when-uid-is-missing.test-cases';
import { registerOnEnrollNewCardRequestNfckeySendsInvalidParamsWhenKeyNoIsMissing } from './card.handler.on-enroll-new-card-request-nfckey-sends-invalid-params-when-key-no-is-missing.test-cases';
import { registerOnEnrollNewCardRequestNfckeySendsCardAlreadyEnrolledWhenACardWithTheUidAlreadyExists } from './card.handler.on-enroll-new-card-request-nfckey-sends-card-already-enrolled-when-a-card-with-the-uid-already-exists.test-cases';
import { registerOnEnrollNewCardRequestNfckeyGeneratesAKeyStoresEnrollNewCardDataAndSendsEnrollNewCardOnSuccess } from './card.handler.on-enroll-new-card-request-nfckey-generates-a-key-stores-enroll-new-card-data-and-sends-enroll-new-card-on-success.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function defineOnEnrollNewCardRequestNfckeyTests(parentScope: AttractapCardHandlerTestScope) {
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
      get attractapService() {
        return parentScope.attractapService;
      },
      set attractapService(value: typeof parentScope.attractapService) {
        parentScope.attractapService = value;
      },
    },
    parentScope,
  );
  registerOnEnrollNewCardRequestNfckeySendsUserNotSetWhenNoEnrollmentIsActive(scope);

  registerOnEnrollNewCardRequestNfckeySendsInvalidParamsWhenUidIsMissing(scope);

  registerOnEnrollNewCardRequestNfckeySendsInvalidParamsWhenKeyNoIsMissing(scope);

  registerOnEnrollNewCardRequestNfckeySendsCardAlreadyEnrolledWhenACardWithTheUidAlreadyExists(scope);

  registerOnEnrollNewCardRequestNfckeyGeneratesAKeyStoresEnrollNewCardDataAndSendsEnrollNewCardOnSuccess(scope);

  return scope;
}
