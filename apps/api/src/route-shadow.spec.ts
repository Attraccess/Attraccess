import { registerRouteShadowGuardAtt534Fixture } from './route-shadow.route-shadow-guard-att-534.test-fixture';
import { registerNoParamRouteShadowsAStaticRouteWithinTheSameControllerFileCases } from './route-shadow.route-shadow-guard-att-534.no-param-route-in-an-earlier-controller-shadows-a-static-route-in-a-later-controller-.behaviors.test-cases';
import { registerNoParamRouteInAnEarlierControllerShadowsAStaticRouteInALaterControllerCases } from './route-shadow.route-shadow-guard-att-534.no-param-route-in-an-earlier-controller-shadows-a-static-route-in-a-later-controller-.behaviors.test-cases';
describe('Route-shadow guard (ATT-534)', () => {
  const fixture = registerRouteShadowGuardAtt534Fixture();
  registerNoParamRouteShadowsAStaticRouteWithinTheSameControllerFileCases(fixture);
  registerNoParamRouteInAnEarlierControllerShadowsAStaticRouteInALaterControllerCases(fixture);
});
