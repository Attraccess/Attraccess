import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { ResourceLiveTopicsProvider } from './resource-live-topics.provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { ResourceEventsService } from './sse/resource-events.service';
import { FlowLogRecorderService } from './flows/logs/flow-log-recorder.service';
import { ResourceActivityVisibilityService } from './usage/authorization/resource-activity-visibility.service';
import { ResourceListVisibilityService } from './visibility/resource-list-visibility.service';

function setup(hiddenIds: number[] = []) {
  const registry = new LiveTopicsService();
  const resources = { existingIds: jest.fn(async () => [1]) };
  const events = { subscribeResource: jest.fn(async () => new Subject<{ data: object }>()) };
  const logs = { subjectFor: jest.fn(() => new Subject<{ data: object }>()), releaseSubject: jest.fn() };
  const visibility = {
    resolveMany: jest.fn(async (_user: AuthenticatedUser, ids: number[]) => new Map(ids.map((id) => [id, 'full']))),
    resolve: jest.fn(async () => 'full'),
    canFollowLive: jest.fn(async () => true),
    viewLiveStream: jest.fn((stream: unknown) => stream),
  };
  const listVisibility = {
    filterVisible: jest.fn(async (_user: AuthenticatedUser, ids: number[]) =>
      ids.filter((id) => !hiddenIds.includes(id)),
    ),
    followVisible: jest.fn((stream: unknown) => stream),
  };
  const provider = new ResourceLiveTopicsProvider(
    registry,
    resources as never,
    events as unknown as ResourceEventsService,
    logs as unknown as FlowLogRecorderService,
    visibility as unknown as ResourceActivityVisibilityService,
    listVisibility as unknown as ResourceListVisibilityService,
  );
  provider.onModuleInit();
  return { registry, resources, events, logs, listVisibility };
}

describe('resource live topic provider', () => {
  it('checks resource existence and flow-log permissions on every renewal with one shared lookup', async () => {
    const { registry, resources } = setup();
    const user = { id: 1, effectivePermissions: new Set() } as AuthenticatedUser;
    const subscriptions: LiveSubscription[] = [
      { topic: 'resource', resourceId: 1 },
      { topic: 'flow-logs', resourceId: 1 },
      { topic: 'resource', resourceId: 2 },
      { topic: 'resource', resourceId: 1 },
    ];
    await expect(registry.authorize(subscriptions, user)).resolves.toEqual(
      new Map([
        ['flow-logs:1', 'Resource update permission required'],
        ['resource:2', 'Resource not found'],
      ]),
    );
    expect(resources.existingIds).toHaveBeenCalledTimes(1);
    expect(resources.existingIds).toHaveBeenCalledWith([1, 2]);
    user.effectivePermissions.add('resources.update');
    await expect(registry.authorize(subscriptions, user)).resolves.toEqual(
      new Map([['resource:2', 'Resource not found']]),
    );
    user.effectivePermissions.clear();
    await expect(registry.authorize(subscriptions, user)).resolves.toEqual(
      new Map([
        ['flow-logs:1', 'Resource update permission required'],
        ['resource:2', 'Resource not found'],
      ]),
    );
    expect(resources.existingIds).toHaveBeenCalledTimes(3);
  });

  it('skips resource queries for user-only subscriptions', async () => {
    const { registry, resources } = setup();
    registry.register({ topics: [{ topic: 'messaging', scope: 'user' }], source: () => new Subject() });
    await expect(registry.authorize([{ topic: 'messaging' }], { id: 1 } as AuthenticatedUser)).resolves.toEqual(
      new Map(),
    );
    expect(resources.existingIds).not.toHaveBeenCalled();
  });

  it('delegates initial resource state and lazily creates and releases flow-log subjects', async () => {
    const { registry, events, logs } = setup();
    const user = { id: 1 } as AuthenticatedUser;
    await registry.source({ topic: 'resource', resourceId: 1 }, user);
    expect(events.subscribeResource).toHaveBeenCalledWith(1);
    const source = await registry.source({ topic: 'flow-logs', resourceId: 1 }, user);
    expect(logs.subjectFor).not.toHaveBeenCalled();
    const observer = source.subscribe();
    expect(logs.subjectFor).toHaveBeenCalledWith(1);
    observer.unsubscribe();
    expect(logs.releaseSubject).toHaveBeenCalledWith(1);
  });

  it('refuses a subscription to a machine the viewer may not see, like a machine that does not exist', async () => {
    const { registry, listVisibility } = setup([1]);
    const user = { id: 1, effectivePermissions: new Set(['resources.update']) } as AuthenticatedUser;
    await expect(
      registry.authorize(
        [
          { topic: 'resource', resourceId: 1 },
          { topic: 'flow-logs', resourceId: 1 },
          { topic: 'resource', resourceId: 2 },
        ],
        user,
      ),
    ).resolves.toEqual(
      new Map([
        ['resource:1', 'Resource not found'],
        ['flow-logs:1', 'Resource not found'],
        ['resource:2', 'Resource not found'],
      ]),
    );
    expect(listVisibility.filterVisible).toHaveBeenCalledTimes(1);
  });

  it('drops the events of a hidden machine from an open resource stream', async () => {
    const { registry, listVisibility } = setup();
    const user = { id: 1 } as AuthenticatedUser;
    await registry.source({ topic: 'resource', resourceId: 1 }, user);
    expect(listVisibility.followVisible).toHaveBeenCalledWith(expect.anything(), user, 1);
  });
});
