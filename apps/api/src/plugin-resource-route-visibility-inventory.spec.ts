import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as semver from 'semver';
import { Node, type Decorator } from 'ts-morph';
import { scanControllers, type ScannedController } from './test-utils/route-inventory';

/**
 * Machine list visibility on plugin routes (ATT-1407): like core's inventory (resource-route-visibility-inventory),
 * this fails when a route of an official plugin holds `resources/:resourceId` or `resources/:id` and neither the
 * route nor its controller carries the SDK's `@ResourceVisible()` for that parameter. It lives in the API project so
 * it covers every plugin, also a new one; the project's test inputs include the plugin backends.
 */
const PLUGINS = resolve(__dirname, '../../plugins');

const backendDirectories = () =>
  readdirSync(PLUGINS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PLUGINS, entry.name, 'backend'))
    .filter((directory) => existsSync(directory));

/** The parameter `@ResourceVisible(...)` reads: its string argument, `resourceId` without one. */
function declaredParam(decorator: Decorator | undefined): string | undefined {
  if (!decorator) return undefined;
  const [argument] = decorator.getArguments();
  if (!argument) return 'resourceId';
  return Node.isStringLiteral(argument) ? argument.getLiteralValue() : '(unreadable)';
}

const usesDecorator = ({ classDecorator, routes }: ScannedController) =>
  Boolean(classDecorator) || routes.some((route) => route.decorator);

/** The machine routes without a decorator that reads their machine id, as `controller: route`. */
function uncovered(controllers: ScannedController[]): string[] {
  return controllers.flatMap(({ controller, classDecorator, routes }) =>
    routes
      .filter((route) => route.machineParam && declaredParam(route.decorator ?? classDecorator) !== route.machineParam)
      .map((route) => `${controller}: ${route.route}`),
  );
}

/** Routes a class-level decorator would misread: their parameter of that name is not a machine id. */
function foreignParams(controllers: ScannedController[]): string[] {
  return controllers.flatMap(({ controller, classDecorator, routes }) => {
    const param = declaredParam(classDecorator);
    return routes
      .filter((route) => param && !route.machineParam && route.params.includes(param))
      .map((route) => `${controller}: ${route.route}`);
  });
}

describe('per-machine plugin routes answer 404 for hidden machines (ATT-1407)', () => {
  const { controllers, unreadable } = scanControllers(PLUGINS, backendDirectories(), 'ResourceVisible');
  const machineRoutes = controllers.flatMap(({ controller, routes }) =>
    routes.filter((route) => route.machineParam).map((route) => `${controller}: ${route.route}`),
  );

  it('finds the reservations and WAGO machine routes, so the scan cannot silently check nothing', () => {
    expect(machineRoutes).toEqual(
      expect.arrayContaining([
        'reservations/backend/api/reservations.controller.ts:ReservationsController: availability reservations/resources/:resourceId/availability',
        'reservations/backend/api/settings.controller.ts:ReservationSettingsController: updateSettings reservations/resources/:resourceId/settings',
        'wago/backend/diagnostics/service.ts:WagoDiagnosticsController: getResource wago/resources/:id/diagnostics',
      ]),
    );
    expect(machineRoutes.length).toBeGreaterThanOrEqual(7);
  });

  it('can read every plugin controller and route path', () => {
    expect(unreadable).toEqual([]);
  });

  it('puts @ResourceVisible() on every route that serves resources/:resourceId or resources/:id', () => {
    expect(uncovered(controllers)).toEqual([]);
  });

  it('keeps a class-level @ResourceVisible() away from routes whose parameter is not a machine id', () => {
    expect(foreignParams(controllers)).toEqual([]);
  });

  // A host before 2.0.0-beta.2 has no @ResourceVisible() and no viewer-scoped resourceAccess methods.
  it('keeps a plugin that uses the decorator off hosts that do not have it', () => {
    const users = [...new Set(controllers.filter(usesDecorator).map(({ controller }) => controller.split('/')[0]))];
    expect(users).toEqual(expect.arrayContaining(['reservations', 'wago']));
    for (const plugin of [...users, 'status-wall']) {
      const read = (file: string) => JSON.parse(readFileSync(join(PLUGINS, plugin, file), 'utf8'));
      const min = read('plugin.json').attraccessVersion.min;
      expect({ plugin, supported: semver.gte(min, '2.0.0-beta.2') }).toEqual({ plugin, supported: true });
      expect(read('package.json').attraccess.host).toBe(`^${min}`);
    }
  });

  it('reports a route without a decorator, or with one that reads another parameter', () => {
    const stripped = controllers.map((entry) => ({
      ...entry,
      classDecorator: undefined,
      routes: entry.routes.map((route) => ({ ...route, decorator: undefined })),
    }));
    expect(uncovered(stripped)).toEqual(machineRoutes);

    const wago = controllers.filter((entry) => entry.controller.endsWith(':WagoDiagnosticsController'));
    const availability = controllers
      .flatMap((entry) => entry.routes)
      .find((route) => route.route.startsWith('availability '));
    // The reservations decorator reads `:resourceId`, which would never fire on WAGO's `resources/:id`.
    const misread = wago.map((entry) => ({
      ...entry,
      routes: entry.routes.map((route) => ({ ...route, decorator: availability?.decorator })),
    }));
    expect(uncovered(misread)).toHaveLength(1);
  });
});
