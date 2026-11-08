import { EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ForbiddenException, type ExecutionContext, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RabbitmqCapabilitiesController } from './capabilities';
import { RabbitmqConnectionsController } from './connections/service';
import { RabbitmqDetectionController } from './detection/service';
import { RabbitmqMessagesController } from './messages/service';
import { RABBITMQ_MANAGE_PERMISSION, RABBITMQ_VIEW_PERMISSION } from './permissions';
import plugin from './plugin';
import { RabbitmqStatsController } from './stats/service';
import { RabbitmqUsersController } from './users/service';

const VIEW = RABBITMQ_VIEW_PERMISSION;
const MANAGE = RABBITMQ_MANAGE_PERMISSION;

// The controllers the plugin actually mounts, so an unlisted controller cannot
// slip past the coverage test below.
const REGISTERED = (plugin.register({} as never).controllers ?? []) as Type[];
const registered = (name: string): Type => {
  const controller = REGISTERED.find((candidate) => candidate.name === name);
  if (!controller) throw new Error(`${name} is not registered`);
  return controller;
};

// Every HTTP route of the plugin and the permission it must demand. The
// coverage test below fails when a route is added without an entry here.
const ROUTES: [Type, string, string][] = [
  [registered('RabbitmqController'), 'status', VIEW],
  [RabbitmqCapabilitiesController, 'capabilities', VIEW],
  [RabbitmqDetectionController, 'detect', VIEW],
  [RabbitmqUsersController, 'list', VIEW],
  [RabbitmqUsersController, 'upsert', MANAGE],
  [RabbitmqUsersController, 'remove', MANAGE],
  [RabbitmqUsersController, 'setPermissions', MANAGE],
  [RabbitmqUsersController, 'clearPermissions', MANAGE],
  [RabbitmqConnectionsController, 'list', VIEW],
  [RabbitmqConnectionsController, 'close', MANAGE],
  [RabbitmqStatsController, 'get', VIEW],
  [RabbitmqMessagesController, 'publish', MANAGE],
];

function check(controller: Type, method: string, granted: string[]): boolean {
  const guard = new EffectivePermissionsGuard(new Reflector());
  const context = {
    getHandler: () => controller.prototype[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 1, effectivePermissions: new Set(granted) } }) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

describe('RabbitMQ plugin permission tiers', () => {
  it('keeps the two tiers on distinct core keys', () => {
    expect(VIEW).toBe('resources.update');
    expect(MANAGE).toBe('system.settings.manage');
  });

  it.each(ROUTES)('%p.%s requires %s', (controller, method, required) => {
    expect(check(controller, method, [required])).toBe(true);
    expect(check(controller, method, [])).toBe(false);
    // A view-only user must never reach a manage route; a manage-only user is
    // not implicitly allowed on view routes either (keys are independent).
    const other = required === VIEW ? MANAGE : VIEW;
    expect(check(controller, method, [other])).toBe(false);
  });

  it('declares a permission for every registered controller and route handler', () => {
    const covered = new Set(ROUTES.map(([controller, method]) => `${controller.name}.${method}`));
    const listed = new Set(ROUTES.map(([controller]) => controller));
    expect(REGISTERED.length).toBeGreaterThan(0);
    for (const controller of REGISTERED) {
      expect(listed).toContain(controller);
      const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
        (name) => name !== 'constructor' && Reflect.getMetadata('path', controller.prototype[name]) !== undefined,
      );
      for (const handler of handlers) {
        expect(covered).toContain(`${controller.name}.${handler}`);
      }
    }
  });
});
