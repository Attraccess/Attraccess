import type { HostInfoService, Lang } from '../notifications/host-info.service';
import { ReservationNotifications } from '../notifications/notifier.service';
import { PendingDecisionStore } from '../hooks/pending-decisions';
import { ReaderUiService } from '../reader-ui/reader-ui.service';
import { PreStartService } from '../hooks/pre-start.service';
import { SessionEndService } from '../hooks/session-end.service';
import { ReservationEventHandlers } from '../events/event-handlers.service';
import { ReservationScheduler } from '../scheduler/scheduler.service';
import type { Harness } from './harness.test-utils';

/**
 * The services that run outside a request (notifications, scheduler, event handlers, pre-start and
 * session-end hooks) on top of the core harness, with a scripted host-info facade.
 */
export function createBackgroundServices(h: Harness) {
  const info = {
    managers: new Map<number, number[]>(),
    languages: new Map<number, Lang>(),
    baseUrl: 'https://app.test' as string | null,
    unhealthy: 0,
  };
  const hostInfo = {
    getBaseUrl: async () => info.baseUrl,
    languagesOf: async (ids: number[]) => new Map(ids.map((id) => [id, info.languages.get(id) ?? 'en'])),
    managerIdsOf: async (resourceId: number) => info.managers.get(resourceId) ?? [],
    countUnhealthyEntries: async () => info.unhealthy,
  } as unknown as HostInfoService;
  const notifications = new ReservationNotifications(
    h.context,
    hostInfo,
    h.directory,
    h.globalSettings,
    h.settings,
    h.store,
    h.clock,
  );
  const decisions = new PendingDecisionStore();
  const newScheduler = () =>
    new ReservationScheduler(h.context, h.store, h.reservations, h.settings, notifications, h.clock);
  const newEvents = () =>
    new ReservationEventHandlers(
      h.context,
      h.store,
      h.reservations,
      h.settings,
      h.access,
      notifications,
      hostInfo,
      decisions,
      h.clock,
    );
  return {
    info,
    hostInfo,
    notifications,
    decisions,
    scheduler: newScheduler(),
    newScheduler,
    events: newEvents(),
    newEvents,
    preStart: new PreStartService(h.settings, h.globalSettings, h.store, h.access, h.directory, h.visibility, h.clock),
    sessionEnd: new SessionEndService(h.settings, h.globalSettings, h.store, h.reservations, decisions, h.clock),
    readerUi: new ReaderUiService(h.settings, h.globalSettings, h.store, h.access, h.directory, h.clock),
    /** Creates a confirmed booking directly through the service. */
    async book(userId: number, resourceId: number, start: string, end: string) {
      return h.reservations.create(
        { userId, authenticationMethod: 'session' },
        {
          resourceId,
          startTime: new Date(`${start}Z`),
          endTime: new Date(`${end}Z`),
        },
      );
    },
  };
}
export type BackgroundServices = ReturnType<typeof createBackgroundServices>;
