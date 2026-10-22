import { ResourceEventPersistence } from './persistence/port';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';
import { LiveSubscription } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { ResourceLiveTopicsProvider } from './resource-live-topics.provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { ResourceEventsService } from './sse/resource-events.service';
import { FlowLogRecorderService } from './flows/logs/flow-log-recorder.service';

function setup() {
  const registry = new LiveTopicsService();
  const persistence: jest.Mocked<ResourceEventPersistence> = {
    exists: jest.fn(),
    sessionStates: jest.fn(),
    existingIds: jest.fn(async (_ids: readonly number[]) => [1]),
  };
  const events = { subscribeResource: jest.fn(async (_ids: readonly number[]) => new Subject<{ data: object }>()) };
  const logs = { subjectFor: jest.fn(() => new Subject<{ data: object }>()), releaseSubject: jest.fn() };
  const provider = new ResourceLiveTopicsProvider(
    registry,
    persistence,
    events as unknown as ResourceEventsService,
    logs as unknown as FlowLogRecorderService,
  );
  provider.onModuleInit();
  return { registry, persistence, events, logs };
}

describe('resource live topic provider', () => {
  it('checks resource existence and flow-log permissions on every renewal with one shared lookup', async () => {
    const { registry, persistence } = setup();
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
    expect(persistence.existingIds).toHaveBeenCalledTimes(1);
    expect(persistence.existingIds).toHaveBeenCalledWith([1, 2]);
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
    expect(persistence.existingIds).toHaveBeenCalledTimes(3);
  });

  it('skips resource queries for user-only subscriptions', async () => {
    const { registry, persistence } = setup();
    registry.register({ topics: [{ topic: 'messaging', scope: 'user' }], source: () => new Subject() });
    await expect(registry.authorize([{ topic: 'messaging' }], { id: 1 } as AuthenticatedUser)).resolves.toEqual(
      new Map(),
    );
    expect(persistence.existingIds).not.toHaveBeenCalled();
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
});
