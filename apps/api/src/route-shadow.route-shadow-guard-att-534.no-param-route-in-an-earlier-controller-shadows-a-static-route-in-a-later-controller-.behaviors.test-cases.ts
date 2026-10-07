import { type ShadowReport } from './route-shadow.paths.test-fixture';
import { registerRouteShadowGuardAtt534Fixture } from './route-shadow.route-shadow-guard-att-534.test-fixture';

export function registerNoParamRouteInAnEarlierControllerShadowsAStaticRouteInALaterControllerCases(
  fixture: ReturnType<typeof registerRouteShadowGuardAtt534Fixture>,
) {
  it('no :param route in an earlier controller shadows a static route in a later controller sharing the same @Controller(prefix)', () => {
    const allShadows: ShadowReport[] = [];
    for (const modulePath of fixture.moduleFiles) {
      allShadows.push(...fixture.detectShadowsInModule(modulePath, fixture.controllerMap));
    }

    const formatted = allShadows.map(
      (r) =>
        `  In ${r.moduleFile.replace(fixture.API_SRC + '/', '')}:\n` +
        `    ${r.shadowingController} @${r.shadowingRoute.method}('${r.shadowingRoute.path}') ` +
        `shadows ${r.shadowedController} @${r.shadowedRoute.method}('${r.shadowedRoute.path}')`,
    );
    expect(formatted).toEqual([]);
  });
}

export function registerNoParamRouteShadowsAStaticRouteWithinTheSameControllerFileCases(
  fixture: ReturnType<typeof registerRouteShadowGuardAtt534Fixture>,
) {
  it('no :param route shadows a static route within the same controller file', () => {
    const allShadows: ShadowReport[] = [];
    for (const [, info] of fixture.controllerMap) {
      allShadows.push(...fixture.detectShadowsWithinController(info));
    }

    const formatted = allShadows.map(
      (r) =>
        `  ${r.shadowingController} line ${r.shadowingRoute.lineNumber} ` +
        `@${r.shadowingRoute.method}('${r.shadowingRoute.path}') ` +
        `shadows line ${r.shadowedRoute.lineNumber} ` +
        `@${r.shadowedRoute.method}('${r.shadowedRoute.path}')`,
    );
    expect(formatted).toEqual([]);
  });
}
