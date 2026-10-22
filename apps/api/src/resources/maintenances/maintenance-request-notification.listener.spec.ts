import { MaintenanceRequestRecipients } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { Resource, ResourceMaintenanceRequest, User } from '@attraccess/application-models';
import { MaintenanceRequestNotificationListener } from './maintenance-request-notification.listener';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';

describe('MaintenanceRequestNotificationListener', () => {
  let listener: MaintenanceRequestNotificationListener;
  let recipients: jest.Mocked<MaintenanceRequestRecipients>;
  let dispatch: { dispatch: jest.Mock };
  let rbacService: { getUserIdsWithPermission: jest.Mock };

  beforeEach(async () => {
    rbacService = { getUserIdsWithPermission: jest.fn().mockResolvedValue([2]) };
    recipients = {
      requestWithAuthor: jest.fn(),
      resourceWithGroups: jest.fn(),
      usersByIds: jest.fn().mockResolvedValue([{ id: 2, email: 'admin@example.com' } as User]),
      introducers: jest.fn().mockResolvedValue([]),
    };
    dispatch = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRequestNotificationListener,
        { provide: MaintenanceRequestRecipients, useValue: recipients },
        { provide: NotificationDispatchService, useValue: dispatch },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    listener = module.get(MaintenanceRequestNotificationListener);
  });

  it('dispatches a maintenance request notification to resource recipients', async () => {
    recipients.requestWithAuthor.mockResolvedValue({
      id: 9,
      reason: 'Broken lens',
      createdByUser: { username: 'alice' },
    } as ResourceMaintenanceRequest);
    recipients.resourceWithGroups.mockResolvedValue({ id: 4, name: 'Laser cutter', groups: [] } as unknown as Resource);

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
    const enUser = { locale: 'en' } as User;
    expect(req.title(enUser)).toBe('Maintenance requested for Laser cutter');
    expect(req.body(enUser)).toBe('alice requested maintenance: Broken lens');
  });
});
