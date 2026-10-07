import { registerStartEnrollOfNewNfcCardThrowsWhenTheReaderIsNotFound } from './card.handler.start-enroll-of-new-nfc-card-throws-when-the-reader-is-not-found.test-cases';
import { registerStartEnrollOfNewNfcCardThrowsWhenTheReaderDoesNotSupportCardEnrollment } from './card.handler.start-enroll-of-new-nfc-card-throws-when-the-reader-does-not-support-card-enrollment.test-cases';
import { registerStartEnrollOfNewNfcCardThrowsWhenTheUserIsNotFound } from './card.handler.start-enroll-of-new-nfc-card-throws-when-the-user-is-not-found.test-cases';
import { registerStartEnrollOfNewNfcCardThrowsWhenThereIsNoConnectedSocketForTheReader } from './card.handler.start-enroll-of-new-nfc-card-throws-when-there-is-no-connected-socket-for-the-reader.test-cases';
import { registerStartEnrollOfNewNfcCardStoresTheEnrollmentPrincipalAndSendsEnrollNewCardGetAvailableKeyNo } from './card.handler.start-enroll-of-new-nfc-card-stores-the-enrollment-principal-and-sends-enroll-new-card-get-available-key-no.test-cases';
import { registerStartEnrollOfNewNfcCardSwallowsASendMessageRejectionPromiseAllSettledAndLogsIt } from './card.handler.start-enroll-of-new-nfc-card-swallows-a-send-message-rejection-promise-all-settled-and-logs-it.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function defineStartEnrollOfNewNfcCardTests(parentScope: AttractapCardHandlerTestScope) {
  const scope = inheritTestScope(
    {
      get attractapService() {
        return parentScope.attractapService;
      },
      set attractapService(value: typeof parentScope.attractapService) {
        parentScope.attractapService = value;
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
      get createMockSocket() {
        return parentScope.createMockSocket;
      },
      get websocketService() {
        return parentScope.websocketService;
      },
      set websocketService(value: typeof parentScope.websocketService) {
        parentScope.websocketService = value;
      },
      get mockUser() {
        return parentScope.mockUser;
      },
    },
    parentScope,
  );
  registerStartEnrollOfNewNfcCardThrowsWhenTheReaderIsNotFound(scope);

  registerStartEnrollOfNewNfcCardThrowsWhenTheReaderDoesNotSupportCardEnrollment(scope);

  registerStartEnrollOfNewNfcCardThrowsWhenTheUserIsNotFound(scope);

  registerStartEnrollOfNewNfcCardThrowsWhenThereIsNoConnectedSocketForTheReader(scope);

  registerStartEnrollOfNewNfcCardStoresTheEnrollmentPrincipalAndSendsEnrollNewCardGetAvailableKeyNo(scope);

  registerStartEnrollOfNewNfcCardSwallowsASendMessageRejectionPromiseAllSettledAndLogsIt(scope);

  return scope;
}
