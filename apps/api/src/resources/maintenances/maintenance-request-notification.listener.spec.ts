import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource, ResourceIntroducer, ResourceMaintenanceRequest, User } from '@attraccess/database-entities';
import { MaintenanceRequestNotificationListener } from './maintenance-request-notification.listener';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

describe('MaintenanceRequestNotificationListener', () => {
  let listener: MaintenanceRequestNotificationListener;
  let requestRepository: { findOne: jest.Mock };
  let resourceRepository: { findOne: jest.Mock };
  let userRepository: { createQueryBuilder: jest.Mock };
  let introducerRepository: { find: jest.Mock };
  let dispatch: { dispatch: jest.Mock };

  beforeEach(async () => {
    requestRepository = { findOne: jest.fn() };
    resourceRepository = { findOne: jest.fn() };
    userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 2, email: 'admin@example.com' } as User]),
      }),
    };
    introducerRepository = { find: jest.fn().mockResolvedValue([]) };
    dispatch = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceRequestNotificationListener,
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
        { provide: getRepositoryToken(ResourceIntroducer), useValue: introducerRepository },
        { provide: getRepositoryToken(ResourceMaintenanceRequest), useValue: requestRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: NotificationDispatchService, useValue: dispatch },
      ],
    }).compile();

    listener = module.get(MaintenanceRequestNotificationListener);
  });

  it('dispatches a maintenance request notification to resource recipients', async () => {
    requestRepository.findOne.mockResolvedValue({
      id: 9,
      reason: 'Broken lens',
      createdByUser: { username: 'alice' },
    } as ResourceMaintenanceRequest);
    resourceRepository.findOne.mockResolvedValue({ id: 4, name: 'Laser cutter', groups: [] } as unknown as Resource);

    await listener.handleRequestCreated(new ResourceMaintenanceRequestCreatedEvent(4, 9));

    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.MAINTENANCE_REQUESTS,
        recipients: [expect.objectContaining({ id: 2 })],
        title: 'Maintenance requested for Laser cutter',
        body: 'alice requested maintenance: Broken lens',
        url: '/resources/4/maintenance',
      }),
    );
  });
});
