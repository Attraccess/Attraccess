import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource, ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceUsageNoteNotificationListener } from './resource-usage-note-notification.listener';
import { ResourceUsageNoteAddedEvent } from './events/resource-usage.events';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';

describe('ResourceUsageNoteNotificationListener', () => {
  let listener: ResourceUsageNoteNotificationListener;
  let resourceRepository: { findOne: jest.Mock };
  let introducerRepository: { find: jest.Mock };
  let userRepository: { findBy: jest.Mock };
  let notifications: { dispatch: jest.Mock };
  let rbacService: { getUserIdsWithPermission: jest.Mock };

  const RESOURCE_ID = 7;
  const AUTHOR_ID = 1;

  const buildResource = (overrides: Partial<Resource> = {}): Resource =>
    ({ id: RESOURCE_ID, name: 'Laser Cutter', groups: [], ...overrides } as Resource);

  const buildEvent = (overrides: Partial<ResourceUsageNoteAddedEvent> = {}): ResourceUsageNoteAddedEvent =>
    new ResourceUsageNoteAddedEvent(
      overrides.resourceId ?? RESOURCE_ID,
      overrides.note ?? 'Bed needs leveling',
      overrides.phase ?? 'end',
      overrides.author ?? { id: AUTHOR_ID, username: 'alice' },
    );

  const setAdmins = (admins: User[]) => {
    const ids = admins.map((u) => u.id);
    rbacService.getUserIdsWithPermission.mockResolvedValue(ids);
    userRepository.findBy.mockResolvedValue(admins);
  };

  beforeEach(async () => {
    resourceRepository = { findOne: jest.fn().mockResolvedValue(buildResource()) };
    introducerRepository = { find: jest.fn().mockResolvedValue([]) };
    rbacService = { getUserIdsWithPermission: jest.fn().mockResolvedValue([]) };
    userRepository = { findBy: jest.fn().mockResolvedValue([]) };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceUsageNoteNotificationListener,
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
        { provide: getRepositoryToken(ResourceIntroducer), useValue: introducerRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: NotificationDispatchService, useValue: notifications },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    listener = module.get(ResourceUsageNoteNotificationListener);
  });

  it('emails introducers and admins, excluding the note author and deduping', async () => {
    setAdmins([
      { id: 2, email: 'admin@example.com' } as User,
      { id: AUTHOR_ID, email: 'alice@example.com' } as User, // author also admin -> excluded
    ]);
    introducerRepository.find.mockResolvedValue([
      { user: { id: 3, email: 'intro@example.com' } as User },
      { user: { id: 2, email: 'admin@example.com' } as User }, // dup of admin -> deduped
    ]);

    await listener.handleNoteAdded(buildEvent());

    const request = notifications.dispatch.mock.calls[0][0];
    const ids = request.recipients.map((user: User) => user.id).sort();
    expect(ids).toEqual([2, 3]);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.RESOURCE_USAGE_NOTES,
        title: 'Usage note added for Laser Cutter',
        body: 'alice: Bed needs leveling',
        url: '/resources/7/usage',
      }),
    );
  });

  it('skips users without an email', async () => {
    introducerRepository.find.mockResolvedValue([{ user: { id: 3, email: null } as User }]);

    await listener.handleNoteAdded(buildEvent());

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when the resource is missing', async () => {
    resourceRepository.findOne.mockResolvedValue(null);

    await listener.handleNoteAdded(buildEvent());

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('includes group introducers when the resource belongs to groups', async () => {
    resourceRepository.findOne.mockResolvedValue(buildResource({ groups: [{ id: 9 } as Resource['groups'][number]] }));
    introducerRepository.find.mockResolvedValue([{ user: { id: 4, email: 'group@example.com' } as User }]);

    await listener.handleNoteAdded(buildEvent());

    const whereArg = introducerRepository.find.mock.calls[0][0].where;
    expect(whereArg).toEqual(expect.arrayContaining([{ resourceId: RESOURCE_ID }]));
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });
});
