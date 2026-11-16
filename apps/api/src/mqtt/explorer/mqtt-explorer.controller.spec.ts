import { EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ForbiddenException, ParseIntPipe, type ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { MqttExplorerController } from './mqtt-explorer.controller';
import { MQTT_EXPLORER_PERMISSION } from './mqtt-explorer.constants';

function canPublish(granted: string[]): boolean {
  const guard = new EffectivePermissionsGuard(new Reflector());
  const context = {
    getHandler: () => MqttExplorerController.prototype.publish,
    getClass: () => MqttExplorerController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 1, effectivePermissions: new Set(granted) } }) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

describe('MqttExplorerController', () => {
  it('lets users who can edit resources publish', () => {
    expect(canPublish([MQTT_EXPLORER_PERMISSION])).toBe(true);
  });

  it.each([[[]], [['resources.read']], [['system.settings.manage']]])('refuses publishing with %j', (granted) => {
    expect(canPublish(granted)).toBe(false);
  });

  it('publishes as the session user, with the id parsed as a number', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const controller = new MqttExplorerController({ publish } as never);
    const user = { id: 7, authenticationMethod: 'session' };
    const dto = { topic: 'a/b', payload: 'x' };
    await controller.publish(3, dto, { user } as never);
    expect(publish).toHaveBeenCalledWith(user, 3, dto);

    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, MqttExplorerController, 'publish') as Record<
      string,
      { data?: string; pipes?: unknown[] }
    >;
    const id = Object.values(args).find((arg) => arg.data === 'id');
    expect(id?.pipes).toContain(ParseIntPipe);
  });
});
