import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroducerType } from '@attraccess/application-models';
import { ResourceGroupsIntroducersService } from './resourceGroups.introducers.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { RESOURCE_GROUP_INTRODUCER_STORE } from '../resource-group-store.port';
import { NotificationCategory } from '../../../notifications/notification-types';

const flushNotifications = () => new Promise((resolve) => setImmediate(resolve));

describe('ResourceGroupsIntroducersService notifications', () => {
  let service: ResourceGroupsIntroducersService;
  let repository: { list: jest.Mock; find: jest.Mock; insert: jest.Mock; remove: jest.Mock; findGroupName: jest.Mock };
  let notifications: { dispatchToUser: jest.Mock };

  beforeEach(async () => {
    repository = {
      list: jest.fn(),
      find: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockImplementation(async (groupId, userId, type) => ({ id: 1, userId, type })),
      remove: jest.fn().mockResolvedValue(undefined),
      findGroupName: jest.fn().mockResolvedValue('Wood shop'),
    };
    notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroducersService,
        { provide: RESOURCE_GROUP_INTRODUCER_STORE, useValue: repository },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceGroupsIntroducersService);
  });

  const texts = (locale: string | null) => {
    const request = notifications.dispatchToUser.mock.calls[0][1];
    return { title: request.title({ locale }), body: request.body({ locale }) };
  };

  it('notifies the user with the group name when group maintainer status is granted', async () => {
    await service.grant(5, 3, ResourceIntroducerType.MAINTAINER);
    await flushNotifications();

    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        url: '/resource-groups/5',
        dedupeKey: 'group-access-5-3-maintainer-granted',
      }),
    );
    expect(texts('en')).toEqual({
      title: 'Your group access changed',
      body: 'You were made a maintainer for group "Wood shop".',
    });
    expect(texts('de')).toEqual({
      title: 'Dein Gruppenzugriff hat sich geändert',
      body: 'Du wurdest zum Wartenden für die Gruppe „Wood shop“ ernannt.',
    });
  });

  it.each([
    [
      ResourceIntroducerType.MAINTAINER,
      true,
      'You were made a maintainer for group "Wood shop".',
      'Du wurdest zum Wartenden für die Gruppe „Wood shop“ ernannt.',
    ],
    [
      ResourceIntroducerType.INTRODUCER,
      true,
      'You were made an introducer for group "Wood shop".',
      'Du wurdest zum Einweiser für die Gruppe „Wood shop“ ernannt.',
    ],
    [
      ResourceIntroducerType.MAINTAINER,
      false,
      'Your maintainer status for group "Wood shop" was revoked.',
      'Dein Wartenden-Status für die Gruppe „Wood shop“ wurde entzogen.',
    ],
    [
      ResourceIntroducerType.INTRODUCER,
      false,
      'Your introducer status for group "Wood shop" was revoked.',
      'Dein Einweiser-Status für die Gruppe „Wood shop“ wurde entzogen.',
    ],
  ])('names the group for %s (granted: %s) in English and German', async (type, granted, enBody, deBody) => {
    repository.find.mockResolvedValue(granted ? null : { id: 8, userId: 3, type });

    await (granted ? service.grant(5, 3, type) : service.revoke(5, 3, type));
    await flushNotifications();

    expect(texts('en').body).toBe(enBody);
    expect(texts(null).body).toBe(enBody);
    expect(texts('de').body).toBe(deBody);
  });

  it('falls back to #<id> and logs when the group name lookup fails, without failing the grant', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository.findGroupName.mockRejectedValue(new Error('database down'));

    await expect(service.grant(5, 3, ResourceIntroducerType.INTRODUCER)).resolves.toEqual(
      expect.objectContaining({ id: 1 }),
    );
    await flushNotifications();

    expect(texts('en').body).toBe('You were made an introducer for group "#5".');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('group #5'));
    warn.mockRestore();
  });

  it('names an introducer grant and falls back to #<id> when the group is gone', async () => {
    repository.findGroupName.mockResolvedValue(null);

    await service.grant(5, 3, ResourceIntroducerType.INTRODUCER);
    await flushNotifications();

    expect(texts('en').body).toBe('You were made an introducer for group "#5".');
  });

  it('notifies the user when group introducer or maintainer status is revoked', async () => {
    repository.find.mockResolvedValue({ id: 8, userId: 3, type: ResourceIntroducerType.INTRODUCER });

    await service.revoke(5, 3, ResourceIntroducerType.INTRODUCER);
    await flushNotifications();

    expect(notifications.dispatchToUser).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        url: '/resource-groups/5',
        dedupeKey: 'group-access-5-3-introducer-revoked',
      }),
    );
    expect(texts('en').body).toBe('Your introducer status for group "Wood shop" was revoked.');
    expect(texts('de').body).toBe('Dein Einweiser-Status für die Gruppe „Wood shop“ wurde entzogen.');
  });

  it('creates a second role without overwriting an existing one', async () => {
    repository.find.mockImplementation((_groupId, _userId, type) =>
      Promise.resolve(
        type === ResourceIntroducerType.INTRODUCER ? { id: 2, type: ResourceIntroducerType.INTRODUCER } : null,
      ),
    );

    await service.grant(5, 3, ResourceIntroducerType.MAINTAINER);

    expect(repository.find).toHaveBeenCalledWith(5, 3, ResourceIntroducerType.MAINTAINER);
    expect(repository.insert).toHaveBeenCalledWith(5, 3, ResourceIntroducerType.MAINTAINER);
  });

  it('removes the revoked grant by id and tells nothing when there is none', async () => {
    repository.find.mockResolvedValue({ id: 8, userId: 3, type: ResourceIntroducerType.INTRODUCER });
    await service.revoke(5, 3);
    expect(repository.remove).toHaveBeenCalledWith(8);

    await flushNotifications();
    repository.remove.mockClear();
    notifications.dispatchToUser.mockClear();
    repository.findGroupName.mockClear();
    repository.find.mockResolvedValue(null);
    expect(await service.revoke(5, 3)).toBeUndefined();
    await flushNotifications();
    expect(repository.remove).not.toHaveBeenCalled();
    expect(repository.findGroupName).not.toHaveBeenCalled();
    expect(notifications.dispatchToUser).not.toHaveBeenCalled();
  });
});
