import { registerAttractapCardHandlerEnrollsForTheTargetUserWhileAuditingTheAdminApiTokenPrincipal } from './card.handler.attractap-card-handler-enrolls-for-the-target-user-while-auditing-the-admin-api-token-principal.test-cases';
import { registerAttractapCardHandlerDoesNotReviveCancelledEnrollmentAfterS } from './card.handler.attractap-card-handler-does-not-revive-cancelled-enrollment-after-s.test-cases';
import { registerAttractapCardHandlerPreservesANewerEnrollmentWhileAuditingAnOlderCommittedCard } from './card.handler.attractap-card-handler-preserves-a-newer-enrollment-while-auditing-an-older-committed-card.test-cases';
import { registerAttractapCardHandlerDoesNotClearANewerEnrollmentWhenThePreviousSendFailsLate } from './card.handler.attractap-card-handler-does-not-clear-a-newer-enrollment-when-the-previous-send-fails-late.test-cases';
import { resetTestFixture } from './card.handler.setup.test-fixture';
import { createAttractapCardHandlerFixture } from './card.handler.spec.createAttractapCardHandlerFixture.test-fixture';
import { defineHandleCardAuthenticationRequestTests } from './card.handler.spec.define-attractap-card-handler-tests.defineHandleCardAuthenticationRequestTests.test-fixture';
import { defineOnEnrollNewCardTests } from './card.handler.spec.define-attractap-card-handler-tests.defineOnEnrollNewCardTests.test-fixture';
import { defineStartResetOfNfcCardTests } from './card.handler.spec.define-attractap-card-handler-tests.defineStartResetOfNfcCardTests.test-fixture';
import { defineOnEnrollNewCardRequestNfckeyTests } from './card.handler.spec.define-attractap-card-handler-tests.defineOnEnrollNewCardRequestNfckeyTests.test-fixture';
import { defineOnResetNfcCardTests } from './card.handler.spec.define-attractap-card-handler-tests.defineOnResetNfcCardTests.test-fixture';
import { defineStartEnrollOfNewNfcCardTests } from './card.handler.spec.define-attractap-card-handler-tests.defineStartEnrollOfNewNfcCardTests.test-fixture';

export function defineAttractapCardHandlerTests() {
  const scope = createAttractapCardHandlerFixture();
  beforeEach(() => {
    resetTestFixture(scope);
  });

  describe('startEnrollOfNewNfcCard', () => {
    defineStartEnrollOfNewNfcCardTests(scope);
  });
  registerAttractapCardHandlerEnrollsForTheTargetUserWhileAuditingTheAdminApiTokenPrincipal(scope);

  describe('onResetNfcCard', () => {
    defineOnResetNfcCardTests(scope);
  });

  describe('onResetNfcCardCancel', () => {
    it('clears reset state', async () => {
      const socket = scope.createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });

      await scope.handler.onResetNfcCardCancel(socket);

      expect(socket.state.resetNfcCardData).toBeNull();
    });
  });

  describe('onEnrollNewCardRequestNFCKey', () => {
    defineOnEnrollNewCardRequestNfckeyTests(scope);
  });

  describe('onEnrollNewCard', () => {
    defineOnEnrollNewCardTests(scope);
  });

  registerAttractapCardHandlerDoesNotReviveCancelledEnrollmentAfterS(scope);

  registerAttractapCardHandlerPreservesANewerEnrollmentWhileAuditingAnOlderCommittedCard(scope);

  registerAttractapCardHandlerDoesNotClearANewerEnrollmentWhenThePreviousSendFailsLate(scope);

  describe('startResetOfNfcCard', () => {
    defineStartResetOfNfcCardTests(scope);
  });

  describe('handleCardAuthenticationRequest', () => {
    defineHandleCardAuthenticationRequestTests(scope);
  });

  return scope;
}
