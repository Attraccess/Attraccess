import {
  createInMemoryPluginStorage,
  SystemEvent,
  type PluginActiveSession,
  type PluginContext,
  type PluginMaintenanceWindow,
  type PluginResourceDirectory,
} from '@attraccess/plugins-backend-sdk';
import { statusWallStorage } from './storage';

type PluginResourceDisplayModel = Awaited<ReturnType<PluginResourceDirectory['listDisplay']>>[number];

type Handler = (payload: { resourceId: number }) => void;

/** A PluginContext with in-memory storage and scripted host data, sessions, maintenance and events. */
export function createFakeContext() {
  const memory = createInMemoryPluginStorage(statusWallStorage);
  const state = {
    resources: [] as PluginResourceDisplayModel[],
    groups: new Map<number, number[]>(),
    sessions: new Map<number, PluginActiveSession[]>(),
    maintenance: new Map<number, PluginMaintenanceWindow[]>(),
  };
  const handlers = new Map<SystemEvent, Set<Handler>>();

  const context = {
    storage: memory.storage,
    persistence: memory.persistence,
    hostData: {
      resources: {
        listDisplay: jest.fn(async (ids?: number[]) =>
          state.resources.filter((resource) => ids === undefined || ids.includes(resource.id)),
        ),
        listIdsInGroups: jest.fn(async (groupIds: number[]) => groupIds.flatMap((id) => state.groups.get(id) ?? [])),
      },
    },
    resourceAccess: {
      getActiveSessions: jest.fn(async (id: number) => state.sessions.get(id) ?? []),
      getMaintenanceWindows: jest.fn(async (id: number) => state.maintenance.get(id) ?? []),
    },
    onEvent: jest.fn((event: SystemEvent, handler: Handler) => {
      const set = handlers.get(event) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(event, set);
      return { off: () => set.delete(handler) };
    }),
  } as unknown as PluginContext;

  const emit = (event: SystemEvent, resourceId: number) => {
    for (const handler of handlers.get(event) ?? []) handler({ resourceId });
  };

  return { context, state, memory, emit, handlers };
}
