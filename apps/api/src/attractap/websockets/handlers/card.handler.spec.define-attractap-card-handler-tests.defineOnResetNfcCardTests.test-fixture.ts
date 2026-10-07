import { registerOnResetNfcCardSendsResetNfcCardDataNotSetWhenNoResetState } from './card.handler.on-reset-nfc-card-sends-reset-nfc-card-data-not-set-when-no-reset-state.test-cases';
import { registerOnResetNfcCardDoesNotDeleteAndKeepsStateWhenTheReaderReportsFailure } from './card.handler.on-reset-nfc-card-does-not-delete-and-keeps-state-when-the-reader-reports-failure.test-cases';
import { registerOnResetNfcCardDeletesTheCardAndClearsStateOnSuccess } from './card.handler.on-reset-nfc-card-deletes-the-card-and-clears-state-on-success.test-cases';
import { registerOnResetNfcCardDoesNotAuditAnUnlinkWhenTheCardWasAlreadyRemoved } from './card.handler.on-reset-nfc-card-does-not-audit-an-unlink-when-the-card-was-already-removed.test-cases';
import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function defineOnResetNfcCardTests(parentScope: AttractapCardHandlerTestScope) {
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
      get audit() {
        return parentScope.audit;
      },
      set audit(value: typeof parentScope.audit) {
        parentScope.audit = value;
      },
    },
    parentScope,
  );
  registerOnResetNfcCardSendsResetNfcCardDataNotSetWhenNoResetState(scope);

  registerOnResetNfcCardDoesNotDeleteAndKeepsStateWhenTheReaderReportsFailure(scope);

  registerOnResetNfcCardDeletesTheCardAndClearsStateOnSuccess(scope);

  registerOnResetNfcCardDoesNotAuditAnUnlinkWhenTheCardWasAlreadyRemoved(scope);

  return scope;
}
