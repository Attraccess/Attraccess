import { ResourceHealthRecipients } from './persistence/port';
import { ResourceHealthStatus, type User } from '@attraccess/application-models';
import { ResourceHealthNotificationListener } from './resource-health-notification.listener';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import {
  NotificationDispatchService,
  type NotificationDispatchRequest,
} from '../../notifications/notification-dispatch.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
const resource = { id: 3, name: 'Laser', groups: [{ id: 4 }] };
const admin = { id: 1, email: 'admin@example.test', locale: 'en' };
const introducer = { id: 2, email: 'instructor@example.test', locale: 'de' };
describe('Resource health notifications', () => {
  const persistence: jest.Mocked<ResourceHealthRecipients> = {
    resourceWithGroups: jest.fn(),
    introducersForResource: jest.fn(),
    usersByIds: jest.fn(),
  };
  const notifications = {
    dispatch: jest.fn<Promise<void>, [NotificationDispatchRequest]>(),
    sendEmailTemplate: jest.fn(),
  };
  const rbac = { getUserIdsWithPermission: jest.fn() };
  const listener = new ResourceHealthNotificationListener(
    persistence,
    notifications as unknown as NotificationDispatchService,
    rbac as unknown as RbacService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    persistence.resourceWithGroups.mockResolvedValue(
      resource as unknown as import('@attraccess/application-models').Resource,
    );
    rbac.getUserIdsWithPermission.mockResolvedValue([1, 9]);
    persistence.usersByIds.mockImplementation(
      async (ids) => [admin, { id: 9, email: null }].filter((row) => ids.includes(row.id)) as User[],
    );
    persistence.introducersForResource.mockResolvedValue([
      { user: admin } as unknown as import('@attraccess/application-models').ResourceIntroducer,
      { user: introducer } as unknown as import('@attraccess/application-models').ResourceIntroducer,
      { user: null } as unknown as import('@attraccess/application-models').ResourceIntroducer,
    ]);
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
    await message.sendEmail?.(admin as User, 'en');
    expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(admin, message.category, {
      resource: { id: 3, name: 'Laser' },
      health: {
        status: event.status,
        previousStatus: event.previousStatus,
        reason: 'Overheated',
        identifier: 'temperature',
      },
    });
    expect(persistence.introducersForResource).toHaveBeenCalledWith(3, [4]);
  });
  it('suppresses an initial healthy report and handles missing resources or empty recipient sets', async () => {
    await listener.handleHealthChanged(
      new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.HEALTHY, null, null),
    );
    expect(persistence.resourceWithGroups).not.toHaveBeenCalled();
    const event = new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.UNHEALTHY, null, null);
    persistence.resourceWithGroups.mockResolvedValueOnce(null);
    await listener.handleHealthChanged(event);
    rbac.getUserIdsWithPermission.mockResolvedValue([]);
    persistence.introducersForResource.mockResolvedValue([]);
    await listener.handleHealthChanged(event);
    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(persistence.usersByIds).toHaveBeenCalledWith([]);
  });
  it('renders recovered status without an explicit reason and contains notification failures', async () => {
    persistence.resourceWithGroups.mockResolvedValue({
      ...resource,
      groups: [],
    } as unknown as import('@attraccess/application-models').Resource);
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
