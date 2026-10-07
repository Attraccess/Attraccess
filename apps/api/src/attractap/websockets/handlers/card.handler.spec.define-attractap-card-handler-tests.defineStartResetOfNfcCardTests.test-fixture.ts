import { registerStartResetOfNfcCardReservesOnceWhenCardLookupsCompleteConcurrently } from './card.handler.start-reset-of-nfc-card-reserves-once-when-card-lookups-complete-concurrently.test-cases';
import { registerStartResetOfNfcCardThrowsWhenTheReaderIsNotFound } from './card.handler.start-reset-of-nfc-card-throws-when-the-reader-is-not-found.test-cases';
import { registerStartResetOfNfcCardThrowsWhenTheUserIsNotFound } from './card.handler.start-reset-of-nfc-card-throws-when-the-user-is-not-found.test-cases';
import { registerStartResetOfNfcCardThrowsWhenThereIsNoConnectedSocket } from './card.handler.start-reset-of-nfc-card-throws-when-there-is-no-connected-socket.test-cases';
import { registerStartResetOfNfcCardThrowsWhenTheNfcCardIsNotFound } from './card.handler.start-reset-of-nfc-card-throws-when-the-nfc-card-is-not-found.test-cases';
import { registerStartResetOfNfcCardStoresResetStateAndSendsResetNfcCardWithTheStoredKeyMaterialOnTheHappyPath } from './card.handler.start-reset-of-nfc-card-stores-reset-state-and-sends-reset-nfc-card-with-the-stored-key-material-on-the-happy-path.test-cases';
import { registerStartResetOfNfcCardRetainsResetStateWhenTheCommandIsSentButItsAckIsMissing } from './card.handler.start-reset-of-nfc-card-retains-reset-state-when-the-command-is-sent-but-its-ack-is-missing.test-cases';
import { registerStartResetOfNfcCardClearsResetStateAndPropagatesASendError } from './card.handler.start-reset-of-nfc-card-clears-reset-state-and-propagates-a-send-error.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function defineStartResetOfNfcCardTests(parentScope: AttractapCardHandlerTestScope) {
  const scope = inheritTestScope(
    {
      get createMockSocket() {
        return parentScope.createMockSocket;
      },
      get websocketService() {
        return parentScope.websocketService;
      },
      set websocketService(value: typeof parentScope.websocketService) {
        parentScope.websocketService = value;
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
      get handler() {
        return parentScope.handler;
      },
      set handler(value: typeof parentScope.handler) {
        parentScope.handler = value;
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
  registerStartResetOfNfcCardReservesOnceWhenCardLookupsCompleteConcurrently(scope);
  registerStartResetOfNfcCardThrowsWhenTheReaderIsNotFound(scope);

  registerStartResetOfNfcCardThrowsWhenTheUserIsNotFound(scope);

  registerStartResetOfNfcCardThrowsWhenThereIsNoConnectedSocket(scope);

  registerStartResetOfNfcCardThrowsWhenTheNfcCardIsNotFound(scope);

  registerStartResetOfNfcCardStoresResetStateAndSendsResetNfcCardWithTheStoredKeyMaterialOnTheHappyPath(scope);

  registerStartResetOfNfcCardRetainsResetStateWhenTheCommandIsSentButItsAckIsMissing(scope);

  registerStartResetOfNfcCardClearsResetStateAndPropagatesASendError(scope);

  return scope;
}
