/* eslint-disable @typescript-eslint/no-explicit-any */
import { NetworkRestrictionService } from '../../../network-restriction/network-restriction.service';
import { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSessionResource, UsageSessionUser } from '@attraccess/application-models';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ResourceSessionStartedEvent } from '../events/resource-usage.events';
import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';
import { ACCESS_ONLY_DOOR_MESSAGE } from '../../reader-capabilities/reader-capabilities';
import { AttractapSessionHandler } from '../../../attractap/websockets/handlers/session/session.handler';
import { ResourceActionGuard } from '../../../attractap/websockets/handlers/resource-action.guard';
import { AttractapEvent, AttractapEventType } from '../../../attractap/websockets/websocket.types';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';
import { PreStartService } from '../pre-start/pre-start.service';
import { SessionEndNotifier } from '../pre-start/session-end-notifier.service';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';
import { arrangeIntroducedUser, InMemoryUsageScope } from './fixtures/arrangements.test-fixture';

const user: UsageSessionUser = { id: 5, username: 'door-user' };
const accessOnlyDoor: UsageSessionResource = {
  id: 10,
  name: 'Side Door',
  type: ResourceType.Door,
  allowTakeOver: false,
  separateUnlockAndUnlatch: false,
  accessOnly: true,
};
const regularDoor: UsageSessionResource = { ...accessOnlyDoor, id: 11, name: 'Front Door', accessOnly: false };

class FakeAuth implements CanActivate {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest().user = { ...user, effectivePermissions: new Set() };
    return true;
  }
}

describe('Access-only doors', () => {
  let scope: InMemoryUsageScope;

  beforeEach(async () => {
    ({ scope } = await arrangeIntroducedUser(accessOnlyDoor, user));
    scope.store.addResource(regularDoor);
  });

  const useDoor = (door: UsageSessionResource) => scope.store.addResource(door);
  const savedAction = () => scope.store.sessions.at(-1)?.usageAction;
  const nothingStored = () => expect(scope.store.sessions).toEqual([]);

  describe('UsageDoorActions', () => {
    it.each(['lockDoor', 'unlatchDoor'] as const)('refuses %s on an access-only door', async (method) => {
      useDoor(accessOnlyDoor);

      await expect(scope.service[method](10, user)).rejects.toThrow(ACCESS_ONLY_DOOR_MESSAGE);
      nothingStored();
    });

    it('refuses unlatch on an access-only door even when separate unlatching is stored', async () => {
      useDoor({ ...accessOnlyDoor, separateUnlockAndUnlatch: true });

      await expect(scope.service.unlatchDoor(10, user)).rejects.toThrow(ACCESS_ONLY_DOOR_MESSAGE);
    });

    it('takes unlock on an access-only door as its Open', async () => {
      useDoor(accessOnlyDoor);

      await scope.service.unlockDoor(10, user);

      expect(savedAction()).toBe(ResourceUsageAction.DoorUnlock);
    });

    it('opens an access-only door as a door unlock and fires the door-unlocked flow trigger', async () => {
      useDoor(accessOnlyDoor);

      const usage = await scope.service.openDoor(10, user);

      expect(usage).toMatchObject({ resourceId: 10, userId: 5, usageAction: ResourceUsageAction.DoorUnlock });
      const [eventName, event] = scope.events.emitAsync.mock.calls[0];
      expect(eventName).toBe(ResourceSessionStartedEvent.EVENT_NAME);

      const executor: ResourceFlowsExecutorService = Object.create(ResourceFlowsExecutorService.prototype);
      (executor as any).logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
      const trigger = jest.spyOn(executor as any, 'triggerResourceUsageNode').mockResolvedValue(undefined);
      await executor.handleResourceSessionStartedEvent({
        usage: { ...(event as ResourceSessionStartedEvent).usage, resource: accessOnlyDoor, user },
      } as ResourceSessionStartedEvent);
      expect(trigger).toHaveBeenCalledWith(10, 'input.resource.door.unlocked', expect.anything());
    });

    it('runs the same gate as the other door actions', async () => {
      useDoor(accessOnlyDoor);
      scope.maintenance.hasActiveMaintenance.mockResolvedValue(true);

      await expect(scope.service.openDoor(10, user)).rejects.toThrow();
      nothingStored();
    });

    it('refuses Open on a door that is not access only', async () => {
      useDoor(regularDoor);

      await expect(scope.service.openDoor(11, user)).rejects.toThrow('This door is not access only');
    });

    it('refuses Open on a machine', async () => {
      useDoor({ ...accessOnlyDoor, type: ResourceType.Machine });

      await expect(scope.service.openDoor(10, user)).rejects.toThrow('Resource is not a door');
    });
  });

  describe('REST', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [ResourceUsageController],
        providers: [
          // Only the door actions of the real service: as a provider it would also run its lifecycle hooks.
          {
            provide: ResourceUsageService,
            useValue: {
              lockDoor: (id: number, u: UsageSessionUser) => scope.service.lockDoor(id, u),
              unlatchDoor: (id: number, u: UsageSessionUser) => scope.service.unlatchDoor(id, u),
              openDoor: (id: number, u: UsageSessionUser) => scope.service.openDoor(id, u),
            },
          },
          { provide: ResourceActivityVisibilityService, useValue: {} },
          { provide: PreStartService, useValue: {} },
          { provide: SessionEndNotifier, useValue: {} },
          { provide: NetworkRestrictionService, useValue: { assertAllowed: jest.fn() } },
        ],
      })
        .overrideGuard(DualAuthGuard)
        .useClass(FakeAuth)
        .overrideGuard(EffectivePermissionsGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterEach(() => app.close());

    it.each(['lock', 'unlatch'])('answers 400 to %s on an access-only door', async (action) => {
      useDoor(accessOnlyDoor);

      const response = await request(app.getHttpServer()).post(`/resources/10/usage/${action}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(ACCESS_ONLY_DOOR_MESSAGE);
    });

    it('opens an access-only door', async () => {
      useDoor(accessOnlyDoor);

      const response = await request(app.getHttpServer()).post('/resources/10/usage/open');

      expect(response.status).toBe(201);
      expect(response.body.usageAction).toBe(ResourceUsageAction.DoorUnlock);
    });
  });

  describe('Attractap websocket', () => {
    let handler: AttractapSessionHandler;
    let socket: { readerId: number; state: { verifiedUserId: number }; sendMessage: jest.Mock };
    let guard: ResourceActionGuard;
    const reply = () => socket.sendMessage.mock.calls.at(-1)?.[0].data;

    beforeEach(() => {
      const usersService = { findOne: jest.fn().mockResolvedValue(user) };
      guard = Object.create(ResourceActionGuard.prototype);
      (guard as any).attractapService = {
        findReaderById: jest.fn().mockResolvedValue({ id: 42, resources: [accessOnlyDoor] }),
      };
      (guard as any).usersService = usersService;
      handler = Object.create(AttractapSessionHandler.prototype);
      (handler as any).logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
      (handler as any).resourceUsageService = scope.service;
      (handler as any).usersService = usersService;
      (handler as any).resourceActionGuard = guard;
      socket = { readerId: 42, state: { verifiedUserId: 5 }, sendMessage: jest.fn().mockResolvedValue(undefined) };
      useDoor(accessOnlyDoor);
    });

    const event = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it.each([
      ['handleLockDoor', AttractapEventType.LOCK_DOOR],
      ['handleUnlatchDoor', AttractapEventType.UNLATCH_DOOR],
    ] as const)('refuses %s with the access-only message', async (method, type) => {
      await handler[method](socket as any, event);

      expect(reply()).toEqual({ type, payload: { error: ACCESS_ONLY_DOOR_MESSAGE } });
      nothingStored();
    });

    it('refuses a lock in the door actions too, when the reader check lets it through', async () => {
      jest.spyOn(guard, 'validateResourceAction').mockResolvedValue(true);

      await handler.handleLockDoor(socket as any, event);

      expect(reply()).toEqual({ type: AttractapEventType.LOCK_DOOR, payload: { error: ACCESS_ONLY_DOOR_MESSAGE } });
    });

    it('records the unlock of an older reader as the Open of the door', async () => {
      await handler.handleUnlockDoor(socket as any, event);

      expect(reply()).toEqual({ type: AttractapEventType.UNLOCK_DOOR, payload: { success: true } });
      expect(savedAction()).toBe(ResourceUsageAction.DoorUnlock);
    });
  });
});
