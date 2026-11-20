import { ResourceHealthStatus } from '@attraccess/application-models';
import { ResourceHealthNotificationListener } from './resource-health-notification.listener';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import {
  NotificationDispatchService,
  type NotificationDispatchRequest,
} from '../../notifications/notification-dispatch.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
const resource = { id: 3, name: 'Laser', groupIds: [4] };
type User = { locale: string };
const admin = { id: 1, email: 'admin@example.test', locale: 'en' };
const introducer = { id: 2, email: 'instructor@example.test', locale: 'de' };
describe('Resource health notifications', () => {
  const store = { findResource: jest.fn(), findUsersByIds: jest.fn(), findIntroducerUsers: jest.fn() };
  const notifications = {
    dispatch: jest.fn<Promise<void>, [NotificationDispatchRequest]>(),
    sendEmailTemplate: jest.fn(),
  };
  const rbac = { getUserIdsWithPermission: jest.fn() };
  const listener = new ResourceHealthNotificationListener(
    store as never,
    notifications as unknown as NotificationDispatchService,
    rbac as unknown as RbacService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    store.findResource.mockResolvedValue(resource);
    rbac.getUserIdsWithPermission.mockResolvedValue([1, 9]);
    store.findUsersByIds.mockResolvedValue([admin, { id: 9, email: null }]);
    store.findIntroducerUsers.mockResolvedValue([admin, introducer]);
  });
  it('deduplicates maintainers and group introducers and renders localized warning emails', async () => {
    const event = new ResourceHealthChangedEvent(
      3,
      'temperature',
      ResourceHealthStatus.UNHEALTHY,
      'Overheated',
      ResourceHealthStatus.HEALTHY,
    );
    await listener.handleHealthChanged(event);
    const message = notifications.dispatch.mock.calls[0][0];
    expect(message.recipients).toEqual([admin, introducer]);
    expect(message).toMatchObject({ url: '/resources/3', severity: 'warning' });
    expect(typeof message.title === 'function' && message.title(admin as User)).toBe('Resource degraded: Laser');
    expect(typeof message.body === 'function' && message.body(admin as User)).toBe('Overheated');
    await message.sendEmail?.(admin as User);
    expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(admin, message.category, {
      resource: { id: 3, name: 'Laser' },
      health: {
        status: event.status,
        previousStatus: event.previousStatus,
        reason: 'Overheated',
        identifier: 'temperature',
      },
    });
    expect(store.findIntroducerUsers).toHaveBeenCalledWith(3, [4]);
  });
  it('suppresses an initial healthy report and handles missing resources or empty recipient sets', async () => {
    await listener.handleHealthChanged(
      new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.HEALTHY, null, null),
    );
    expect(store.findResource).not.toHaveBeenCalled();
    const event = new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.UNHEALTHY, null, null);
    store.findResource.mockResolvedValueOnce(null);
    await listener.handleHealthChanged(event);
    rbac.getUserIdsWithPermission.mockResolvedValue([]);
    store.findIntroducerUsers.mockResolvedValue([]);
    await listener.handleHealthChanged(event);
    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(store.findUsersByIds).not.toHaveBeenCalled();
  });
  it('renders recovered status without an explicit reason and contains notification failures', async () => {
    store.findResource.mockResolvedValue({ ...resource, groupIds: [] });
    await listener.handleHealthChanged(
      new ResourceHealthChangedEvent(
        3,
        'temperature',
        ResourceHealthStatus.HEALTHY,
        null,
        ResourceHealthStatus.UNHEALTHY,
      ),
    );
    const message = notifications.dispatch.mock.calls[0][0];
    expect(message.severity).toBe('info');
    expect(typeof message.title === 'function' && message.title(admin as User)).toBe('Resource recovered: Laser');
    expect(typeof message.body === 'function' && message.body(admin as User)).toContain('Laser changed from');
    notifications.dispatch.mockRejectedValueOnce(new Error('Notification unavailable'));
    await expect(
      listener.handleHealthChanged(
        new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.UNHEALTHY, null, null),
      ),
    ).resolves.toBeUndefined();
  });
});
