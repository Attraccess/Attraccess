import { Resource, ResourceUsage, SupervisionMode } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Subject } from 'rxjs';
import { ResourceActivityVisibility } from '../../../settings/constants';
import { ResourceActivityVisibilityService } from './resource-activity-visibility.service';

const MACHINE = 1;
const SUPERVISED_MACHINE = 2;

type Persona = {
  permissions: string[];
  /** Mirrors canControllResource: valid direct or group introduction, introducer or maintainer. */
  canControl?: boolean;
};

const PERSONAS: Record<string, Persona> = {
  'without view resources': { permissions: [] },
  'not introduced': { permissions: ['resources.read'] },
  'introduced directly': { permissions: ['resources.read'], canControl: true },
  'introduced through a group': { permissions: ['resources.read'], canControl: true },
  introducer: { permissions: ['resources.read'], canControl: true },
  maintainer: { permissions: ['resources.read'], canControl: true },
  'manage resources': { permissions: ['resources.read', 'resources.update'] },
  'manage access': { permissions: ['resources.read', 'resources.access.manage'] },
};

function setup(mode: ResourceActivityVisibility) {
  const settings = { getResourceActivityVisibility: jest.fn().mockResolvedValue(mode) };
  const resources = {
    find: jest.fn(async ({ where }: { where: { id: { _value: number[] } } }) =>
      where.id._value
        .filter((id) => id === SUPERVISED_MACHINE)
        .map((id) => ({ id, supervisionMode: SupervisionMode.SUPERVISION_ALLOWED }) as Resource),
    ),
  };
  const controllable = new Set<number>();
  const activeSessions = new Map<number, { id: number; userId: number }>();
  const usage = {
    canControllResource: jest.fn(async (id: number) => controllable.has(id)),
    getActiveSession: jest.fn(async (id: number) => activeSessions.get(id) ?? null),
  };
  const service = new ResourceActivityVisibilityService(settings as never, resources as never, usage as never);
  const user = (persona: Persona, id = 10) => {
    controllable.clear();
    if (persona.canControl) controllable.add(MACHINE).add(SUPERVISED_MACHINE);
    return { id, effectivePermissions: new Set(persona.permissions) } as unknown as AuthenticatedUser;
  };
  return { service, user, settings, resources, controllable, activeSessions };
}

describe('ResourceActivityVisibilityService', () => {
  describe('"all equipment" mode (default)', () => {
    it.each(Object.entries(PERSONAS))('%s', async (name, persona) => {
      const { service, user } = setup('all');
      const expected = persona.permissions.includes('resources.read') ? 'full' : 'none';
      expect(await service.resolve(user(persona), MACHINE)).toBe(expected);
      expect(await service.resolve(user(persona), SUPERVISED_MACHINE)).toBe(expected);
    });
  });

  describe('"introduced only" mode', () => {
    const FULL = [
      'introduced directly',
      'introduced through a group',
      'introducer',
      'maintainer',
      'manage resources',
      'manage access',
    ];
    it.each(Object.keys(PERSONAS))('%s on a regular machine', async (name) => {
      const { service, user } = setup('introduced');
      expect(await service.resolve(user(PERSONAS[name]), MACHINE)).toBe(FULL.includes(name) ? 'full' : 'none');
    });

    it('shows others only free/in use on supervised-use machines', async () => {
      const { service, user } = setup('introduced');
      expect(await service.resolve(user(PERSONAS['not introduced']), SUPERVISED_MACHINE)).toBe('anonymous');
      expect(await service.resolve(user(PERSONAS['without view resources']), SUPERVISED_MACHINE)).toBe('none');
      expect(await service.resolve(user(PERSONAS['introducer']), SUPERVISED_MACHINE)).toBe('full');
    });

    it('gives managers full access even without "view resources"', async () => {
      const { service, user } = setup('introduced');
      for (const permission of ['resources.update', 'resources.access.manage']) {
        expect(await service.resolve(user({ permissions: [permission] }), MACHINE)).toBe('full');
      }
    });

    it('looks up the supervision mode only for machines the viewer may not use', async () => {
      const { service, user, resources } = setup('introduced');
      await service.resolveMany(user(PERSONAS['introduced directly']), [MACHINE, SUPERVISED_MACHINE]);
      expect(resources.find).not.toHaveBeenCalled();
    });

    it('lets the owner, and only people with full access, see the running session', async () => {
      const { service, user, activeSessions } = setup('introduced');
      activeSessions.set(MACHINE, { id: 5, userId: 10 });
      expect(await service.activeSessionView(user(PERSONAS['not introduced'], 10), MACHINE)).toEqual({
        full: false,
        ownUsageId: 5,
      });
      expect(await service.activeSessionView(user(PERSONAS['not introduced'], 11), MACHINE)).toEqual({
        full: false,
        ownUsageId: null,
      });
      expect(await service.activeSessionView(user(PERSONAS['introduced directly'], 11), MACHINE)).toEqual({
        full: true,
        ownUsageId: null,
      });
    });

    it('resolves many machines in one pass', async () => {
      const { service, user } = setup('introduced');
      const access = await service.resolveMany(user(PERSONAS['not introduced']), [
        MACHINE,
        SUPERVISED_MACHINE,
        MACHINE,
      ]);
      expect([...access]).toEqual([
        [MACHINE, 'none'],
        [SUPERVISED_MACHINE, 'anonymous'],
      ]);
    });
  });

  describe('what a viewer gets to see of a session', () => {
    const session = {
      id: 5,
      resourceId: SUPERVISED_MACHINE,
      userId: 77,
      user: { id: 77, username: 'someone', email: 'someone@example.test' },
      startTime: new Date('2026-10-30T10:00:00Z'),
      endTime: null,
      startNotes: 'private',
      usageAction: 'usage',
    } as unknown as ResourceUsage;
    const { service } = setup('introduced');

    it('shows the viewer their own session in full, whatever the machine access', () => {
      expect(service.viewUsage({ ...session, userId: 10 } as ResourceUsage, 'none', 10)).toMatchObject({ userId: 10 });
    });
    it('hides who is using a supervised-use machine', () => {
      const seen = service.viewUsage(session, 'anonymous', 10);
      expect(seen).toEqual({
        id: 5,
        resourceId: SUPERVISED_MACHINE,
        usageAction: 'usage',
        startTime: session.startTime,
        endTime: null,
      });
      expect(JSON.stringify(seen)).not.toContain('someone');
    });
    it('hides the session when the machine is not visible', () => {
      expect(service.viewUsage(session, 'none', 10)).toBeNull();
      expect(service.viewUsage(session, 'full', 10)).toBe(session);
    });
    it('strips the user from live events for anonymous viewers, but not for the owner', () => {
      const event = { data: { eventType: 'started', inUse: true, usage: session } };
      expect(service.viewLiveEvent(event, 'anonymous', 10)).toEqual({
        data: { eventType: 'started', inUse: true, resourceId: SUPERVISED_MACHINE },
      });
      expect(service.viewLiveEvent(event, 'anonymous', 77)).toBe(event);
      expect(service.viewLiveEvent(event, 'full', 10)).toBe(event);
      const keepalive = { data: { keepalive: true } };
      expect(service.viewLiveEvent(keepalive, 'anonymous', 10)).toBe(keepalive);
      expect(service.viewLiveEvent(keepalive, 'none', 10)).toBe(keepalive);
    });
    it('reduces any event to the allowlist for anonymous viewers, even without a usage field', () => {
      const event = {
        data: { eventType: 'resource.usage.session_taken_over', resourceId: 2, inUse: true, newUser: session.user },
      };
      expect(service.viewLiveEvent(event, 'anonymous', 10)).toEqual({
        data: { eventType: 'resource.usage.session_taken_over', resourceId: 2, inUse: true },
      });
    });
    it('drops events the viewer may not see at all, except their own session', () => {
      const event = { data: { eventType: 'started', inUse: true, usage: session } };
      expect(service.viewLiveEvent(event, 'none', 10)).toBeNull();
      expect(service.viewLiveEvent(event, 'none', 77)).toBe(event);
    });
  });

  describe('events about a session ending or changing hands', () => {
    const ended = { data: { eventType: 'ended', resourceId: MACHINE, inUse: false, ownerUserId: 10 } };
    const takenOver = { data: { eventType: 'taken_over', resourceId: MACHINE, inUse: true, ownerUserId: 10 } };

    it.each([ended, takenOver])('reach the owner who may not see activity, without the owner id', (event) => {
      const { service } = setup('introduced');
      expect(service.viewLiveEvent(event, 'none', 10)).toEqual({
        data: expect.not.objectContaining({ ownerUserId: expect.anything() }),
      });
      expect(service.viewLiveEvent(event, 'none', 10)?.data).toMatchObject({
        resourceId: MACHINE,
        inUse: event.data.inUse,
      });
    });

    it.each([ended, takenOver])('never reach anyone else who may not see activity', (event) => {
      const { service } = setup('introduced');
      expect(service.viewLiveEvent(event, 'none', 77)).toBeNull();
    });

    it('show anonymous viewers only free or in use, never the owner id', () => {
      const { service } = setup('introduced');
      expect(service.viewLiveEvent(ended, 'anonymous', 77)).toEqual({
        data: { eventType: 'ended', resourceId: MACHINE, inUse: false },
      });
    });
  });

  describe('live events in "all equipment" mode', () => {
    it('carry the names, as they do today', async () => {
      const { service, user } = setup('all');
      const viewer = user(PERSONAS['not introduced']);
      const events = new Subject<{ data: object }>();
      const seen: object[] = [];
      service.viewLiveStream(events, viewer, MACHINE).subscribe((event) => seen.push(event.data));
      const started = {
        eventType: 'started',
        inUse: true,
        usage: { resourceId: MACHINE, userId: 77, user: { username: 'operator' } },
      };
      events.next({ data: started });
      events.next({ data: { keepalive: true } });
      await new Promise((resolve) => setImmediate(resolve));
      expect(seen).toEqual([started, { keepalive: true }]);
    });
  });

  describe('open live streams', () => {
    it('apply a changed setting to events that arrive after the change', async () => {
      const { service, user, settings } = setup('all');
      const viewer = user(PERSONAS['not introduced']);
      const events = new Subject<{ data: object }>();
      const seen: object[] = [];
      service.viewLiveStream(events, viewer, SUPERVISED_MACHINE).subscribe((event) => seen.push(event.data));
      const started = { eventType: 'started', inUse: true, usage: { resourceId: SUPERVISED_MACHINE, userId: 77 } };

      events.next({ data: started });
      await new Promise((resolve) => setImmediate(resolve));
      settings.getResourceActivityVisibility.mockResolvedValue('introduced');
      events.next({ data: started });
      await new Promise((resolve) => setImmediate(resolve));

      expect(seen).toEqual([started, { eventType: 'started', inUse: true, resourceId: SUPERVISED_MACHINE }]);
    });

    it('stop delivering activity once the viewer loses access, but keep the connection alive', async () => {
      const { service, user, settings, controllable } = setup('introduced');
      const viewer = user(PERSONAS['introduced directly']);
      settings.getResourceActivityVisibility.mockResolvedValue('introduced');
      const events = new Subject<{ data: object }>();
      const seen: object[] = [];
      service.viewLiveStream(events, viewer, MACHINE).subscribe((event) => seen.push(event.data));
      const started = { eventType: 'started', inUse: true, usage: { resourceId: MACHINE, userId: 77 } };

      events.next({ data: started });
      await new Promise((resolve) => setImmediate(resolve));
      controllable.clear();
      events.next({ data: started });
      events.next({ data: { keepalive: true } });
      await new Promise((resolve) => setImmediate(resolve));

      expect(seen).toEqual([started, { keepalive: true }]);
    });
  });
});
