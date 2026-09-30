import { ResourceHealthStatus, type Resource, type ResourceIntroducer, type User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
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
  const resources = { findOne: jest.fn() },
    introducers = { find: jest.fn() },
    users = { findBy: jest.fn() };
  const notifications = {
    dispatch: jest.fn<Promise<void>, [NotificationDispatchRequest]>(),
    sendEmailTemplate: jest.fn(),
  };
  const rbac = { getUserIdsWithPermission: jest.fn() };
  const listener = new ResourceHealthNotificationListener(
    resources as unknown as Repository<Resource>,
    introducers as unknown as Repository<ResourceIntroducer>,
    users as unknown as Repository<User>,
    notifications as unknown as NotificationDispatchService,
    rbac as unknown as RbacService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    resources.findOne.mockResolvedValue(resource);
    rbac.getUserIdsWithPermission.mockResolvedValue([1, 9]);
    users.findBy.mockResolvedValue([admin, { id: 9, email: null }]);
    introducers.find.mockResolvedValue([{ user: admin }, { user: introducer }, { user: null }]);
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
    expect(introducers.find).toHaveBeenCalledWith({
      where: [{ resourceId: 3 }, { resourceGroupId: expect.objectContaining({ _value: [4] }) }],
      relations: ['user'],
    });
  });
  it('suppresses an initial healthy report and handles missing resources or empty recipient sets', async () => {
    await listener.handleHealthChanged(
      new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.HEALTHY, null, null),
    );
    expect(resources.findOne).not.toHaveBeenCalled();
    const event = new ResourceHealthChangedEvent(3, 'temperature', ResourceHealthStatus.UNHEALTHY, null, null);
    resources.findOne.mockResolvedValueOnce(null);
    await listener.handleHealthChanged(event);
    rbac.getUserIdsWithPermission.mockResolvedValue([]);
    introducers.find.mockResolvedValue([]);
    await listener.handleHealthChanged(event);
    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(users.findBy).not.toHaveBeenCalled();
  });
  it('renders recovered status without an explicit reason and contains notification failures', async () => {
    resources.findOne.mockResolvedValue({ ...resource, groups: [] });
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
