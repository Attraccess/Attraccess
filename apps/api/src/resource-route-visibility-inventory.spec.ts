import { resolve } from 'path';
import { scanControllers } from './test-utils/route-inventory';

/**
 * Machine list visibility (ATT-843): a machine the caller may not see answers 404 on every per-machine route. The
 * interceptor does that for a whole controller or a single route, so this inventory fails when a route whose path
 * holds `resources/:resourceId` or `resources/:id` (under any prefix) is covered by neither. A new route in a
 * decorated controller is covered by the class decorator; a new controller cannot skip it silently.
 */
function scanCore() {
  const { controllers, unreadable } = scanControllers(resolve(__dirname), [resolve(__dirname)], 'ResourceListVisible');
  const found = controllers
    .map(({ controller, classDecorator, routes }) => ({
      controller,
      /** Machine routes; each is covered by the class decorator or its own. */
      routes: routes
        .filter((route) => route.machineParam)
        .map((route) => ({ route: route.route, decorated: Boolean(classDecorator ?? route.decorator) })),
      /** Routes of a class-decorated controller whose `:id` is not a machine id: the interceptor would read it as one. */
      foreignIds: classDecorator
        ? routes.filter((route) => !route.machineParam && route.params.includes('id')).map((route) => route.route)
        : [],
    }))
    .filter((entry) => entry.routes.length > 0 || entry.foreignIds.length > 0);
  return { controllers: found, unreadable };
}

describe('per-machine routes answer 404 for hidden machines (ATT-843)', () => {
  const { controllers, unreadable } = scanCore();

  it('finds the per-machine controllers, so the scan cannot silently check nothing', () => {
    const names = controllers.map((entry) => entry.controller.split(':')[1]);
    expect(names).toEqual(
      expect.arrayContaining([
        'ResourcesController',
        'SSEController',
        'SupervisionController',
        'ResourceUsageController',
        'ResourceIntroductionsController',
        'ResourceIntroducersController',
        'MessagingController',
      ]),
    );
    expect(controllers.flatMap((entry) => entry.routes).length).toBeGreaterThan(40);
  });

  it('can read every controller and route path, so no machine route hides behind a computed path', () => {
    expect(unreadable).toEqual([]);
  });

  it('puts @ResourceListVisible() on every route that serves resources/:resourceId or resources/:id', () => {
    expect(
      controllers.flatMap((entry) =>
        entry.routes.filter((route) => !route.decorated).map((route) => `${entry.controller}: ${route.route}`),
      ),
    ).toEqual([]);
  });

  it('keeps `:id` for machine ids in controllers decorated as a whole, because the interceptor reads it as one', () => {
    expect(controllers.flatMap((entry) => entry.foreignIds.map((route) => `${entry.controller}: ${route}`))).toEqual(
      [],
    );
  });
});
