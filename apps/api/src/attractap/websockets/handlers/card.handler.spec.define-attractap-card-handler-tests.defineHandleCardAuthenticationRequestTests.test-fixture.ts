import { registerHandleCardAuthenticationRequestAuthenticatesWhileTheSupplementalResourceListIsS } from './card.handler.handle-card-authentication-request-authenticates-while-the-supplemental-resource-list-is-s.test-cases';
import { registerHandleCardAuthenticationRequestAlwaysIncrementsAttractapNfcTapsTotal } from './card.handler.handle-card-authentication-request-always-increments-attractap-nfc-taps-total.test-cases';
import { registerHandleCardAuthenticationRequestSendsInvalidUidWhenUidIsInvalid } from './card.handler.handle-card-authentication-request-sends-invalid-uid-when-uid-is-invalid.test-cases';
import { registerHandleCardAuthenticationRequestSendsCardNotFoundWhenTheCardDoesNotExist } from './card.handler.handle-card-authentication-request-sends-card-not-found-when-the-card-does-not-exist.test-cases';
import { registerHandleCardAuthenticationRequestSendsCardNotActiveWhenTheCardIsInactive } from './card.handler.handle-card-authentication-request-sends-card-not-active-when-the-card-is-inactive.test-cases';
import { registerHandleCardAuthenticationRequestSetsLastAuthenticatedUserIdAndSendsCardAuthenticationDataOnSuccess } from './card.handler.handle-card-authentication-request-sets-last-authenticated-user-id-and-sends-card-authentication-data-on-success.test-cases';
import { registerHandleCardAuthenticationRequestFlagsRequiresSupervisorForASupervisionRequiredResourceEvenWhenIntroduced } from './card.handler.handle-card-authentication-request-flags-requires-supervisor-for-a-supervision-required-resource-even-when-introduced.test-cases';
import { registerHandleCardAuthenticationRequestKeepsRequiresSupervisorInTheAuthPayloadForSupervisionAllowedWhenTheUserHasNoIntroduct } from './card.handler.handle-card-authentication-request-keeps-requires-supervisor-in-the-auth-payload-for-supervision-allowed-when-the-user-has-no-introduct.test-cases';
import { createHandleCardAuthenticationRequestFixture } from './card.handler.spec.createHandleCardAuthenticationRequestFixture.test-fixture';
import { AttractapCardHandlerTestScope } from './card.handler.spec.define-attractap-card-handler-tests';

export function defineHandleCardAuthenticationRequestTests(parentScope: AttractapCardHandlerTestScope) {
  const scope = createHandleCardAuthenticationRequestFixture(parentScope);

  registerHandleCardAuthenticationRequestAuthenticatesWhileTheSupplementalResourceListIsS(scope);

  registerHandleCardAuthenticationRequestAlwaysIncrementsAttractapNfcTapsTotal(scope);

  registerHandleCardAuthenticationRequestSendsInvalidUidWhenUidIsInvalid(scope);

  registerHandleCardAuthenticationRequestSendsCardNotFoundWhenTheCardDoesNotExist(scope);

  registerHandleCardAuthenticationRequestSendsCardNotActiveWhenTheCardIsInactive(scope);

  registerHandleCardAuthenticationRequestSetsLastAuthenticatedUserIdAndSendsCardAuthenticationDataOnSuccess(scope);

  registerHandleCardAuthenticationRequestFlagsRequiresSupervisorForASupervisionRequiredResourceEvenWhenIntroduced(
    scope,
  );

  registerHandleCardAuthenticationRequestKeepsRequiresSupervisorInTheAuthPayloadForSupervisionAllowedWhenTheUserHasNoIntroduct(
    scope,
  );

  return scope;
}
