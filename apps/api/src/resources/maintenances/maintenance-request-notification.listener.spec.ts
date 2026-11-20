import { Test, TestingModule } from '@nestjs/testing';
import type { ResourceNotificationRecipient } from '@attraccess/application-models';
import { MaintenanceRequestNotificationListener } from './maintenance-request-notification.listener';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { MAINTENANCE_NOTIFICATION_STORE, type MaintenanceNotificationStore } from './maintenance-request-store.port';

const recipient = (id: number, email: string | null): ResourceNotificationRecipient =>
  ({ id, username: `user${id}`, email, locale: 'en' }) as ResourceNotificationRecipient;

describe('MaintenanceRequestNotificationListener', () => {
  let listener: MaintenanceRequestNotificationListener;
  const store: { [K in keyof MaintenanceNotificationStore]: jest.Mock } = {
    findRequest: jest.fn(),
    findResource: jest.fn(),
    findUsersByIds: jest.fn(),
    findIntroducerUsers: jest.fn(),
  };
  let dispatch: { dispatch: jest.Mock };
  let rbacService: { getUserIdsWithPermission: jest.Mock };

  beforeEach(async () => {
    jest.resetAllMocks();
    rbacService = { getUserIdsWithPermission: jest.fn().mockResolvedValue([2]) };
    store.findUsersByIds.mockResolvedValue([recipient(2, 'admin@example.com')]);
    store.findIntroducerUsers.mockResolvedValue([]);
    dispatch = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRequestNotificationListener,
        { provide: MAINTENANCE_NOTIFICATION_STORE, useValue: store },
        { provide: NotificationDispatchService, useValue: dispatch },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    listener = module.get(MaintenanceRequestNotificationListener);
  });

  it('dispatches a maintenance request notification to resource recipients', async () => {
    store.findRequest.mockResolvedValue({ id: 9, reason: 'Broken lens', createdByUsername: 'alice' });
    store.findResource.mockResolvedValue({ id: 4, name: 'Laser cutter', groupIds: [] });

    await listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9));

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.MAINTENANCE_REQUESTS,
        recipients: [expect.objectContaining({ id: 2 })],
        title: expect.any(Function),
        body: expect.any(Function),
        url: '/resources/4/maintenance',
      }),
    );

    const req = dispatch.dispatch.mock.calls[0][0];
    const enUser = { locale: 'en' };
    expect(req.title(enUser)).toBe('Maintenance requested for Laser cutter');
    expect(req.body(enUser)).toBe('alice requested maintenance: Broken lens');
  });

  it('adds introducers of the resource and its groups once, skipping recipients without an address', async () => {
    store.findRequest.mockResolvedValue({ id: 9, reason: 'Broken lens', createdByUsername: null });
    store.findResource.mockResolvedValue({ id: 4, name: 'Laser cutter', groupIds: [8] });
    store.findUsersByIds.mockResolvedValue([recipient(2, 'admin@example.com'), recipient(3, null)]);
    store.findIntroducerUsers.mockResolvedValue([
      recipient(2, 'admin@example.com'),
      recipient(5, 'intro@example.com'),
      recipient(6, ''),
    ]);

    await listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9));

    expect(store.findIntroducerUsers).toHaveBeenCalledWith(4, [8]);
    const req = dispatch.dispatch.mock.calls[0][0];
    expect(req.recipients.map((user: { id: number }) => user.id)).toEqual([2, 5]);
    expect(req.body({ locale: 'en' })).toContain('Broken lens');
  });

  it('does not look up users when nobody holds the maintenance permission and there are no introducers', async () => {
    rbacService.getUserIdsWithPermission.mockResolvedValue([]);
    store.findRequest.mockResolvedValue({ id: 9, reason: 'x', createdByUsername: 'alice' });
    store.findResource.mockResolvedValue({ id: 4, name: 'Laser cutter', groupIds: [] });

    await listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9));

    expect(store.findUsersByIds).not.toHaveBeenCalled();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('skips a missing request or resource and never throws', async () => {
    store.findRequest.mockResolvedValue(null);
    await listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9));
    store.findRequest.mockResolvedValue({ id: 9, reason: 'x', createdByUsername: null });
    store.findResource.mockResolvedValue(null);
    await listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9));
    store.findResource.mockRejectedValue(new Error('db down'));
    await expect(
      listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9)),
    ).resolves.toBeUndefined();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });
});
