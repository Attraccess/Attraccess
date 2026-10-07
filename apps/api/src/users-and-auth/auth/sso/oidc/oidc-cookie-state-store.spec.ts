import { registerOidcCookieStateStoreFixture } from './oidc-cookie-state-store.oidc-cookie-state-store.test-fixture';
import { registerShouldBeDefinedCases } from './oidc-cookie-state-store.oidc-cookie-state-store.full-round-trip.behaviors.test-cases';
import { registerStoreCases } from './oidc-cookie-state-store.oidc-cookie-state-store.store.test-cases';
import { registerVerifyCases } from './oidc-cookie-state-store.oidc-cookie-state-store.verify.test-cases';
import { registerSecurityCases } from './oidc-cookie-state-store.oidc-cookie-state-store.full-round-trip.behaviors.test-cases';
import { registerSameSiteInvariantOidcStateCookieIsAlwaysLaxCases } from './oidc-cookie-state-store.oidc-cookie-state-store.full-round-trip.behaviors.test-cases';
import { registerFullRoundTripCases } from './oidc-cookie-state-store.oidc-cookie-state-store.full-round-trip.behaviors.test-cases';
describe('OidcCookieStateStore', () => {
  const fixture = registerOidcCookieStateStoreFixture();
  registerShouldBeDefinedCases(fixture);
  registerStoreCases(fixture);
  registerVerifyCases(fixture);
  registerSecurityCases(fixture);
  registerSameSiteInvariantOidcStateCookieIsAlwaysLaxCases(fixture);
  registerFullRoundTripCases(fixture);
});
