import {
  registerResourceIntroducersServiceFixture,
  grantRecord,
} from './resourceIntroducers.service.resource-introducers-service.test-fixture';
import { ResourceIntroducerType, type ResourceIntroducerRecord } from '@attraccess/application-models';
import { NotificationCategory } from './../../notifications/notification-types';
import { fakeTransactionScope } from '../../database/fake-transaction-scope.test-fixture';

type User = { locale: string };

describe('ResourceIntroducersService', () => {
  const fixture = registerResourceIntroducersServiceFixture();

  describe('getNames (ATT-1149)', () => {
    const grant = (id: number, userId: number, type: ResourceIntroducerType, group = false) =>
      grantRecord({
        id,
        userId,
        type,
        ...(group ? { resourceId: null, resourceGroupId: 5 } : { resourceId: 1 }),
        user: { id: userId, username: `user${userId}` } as never,
      });
    const withGrants = (direct: ResourceIntroducerRecord[], group: ResourceIntroducerRecord[]) => {
      fixture.store.listDirect.mockResolvedValue(direct);
      fixture.store.listViaGroups.mockResolvedValue(group);
    };

    it('lists direct and group introducers and maintainers with exactly id, username and role', async () => {
      withGrants(
        [grant(1, 10, ResourceIntroducerType.INTRODUCER), grant(2, 11, ResourceIntroducerType.MAINTAINER)],
        [grant(3, 20, ResourceIntroducerType.INTRODUCER, true)],
      );
      const names = await fixture.service.getNames(1);
      expect(names).toEqual([
        { userId: 10, username: 'user10', role: ResourceIntroducerType.INTRODUCER },
        { userId: 11, username: 'user11', role: ResourceIntroducerType.MAINTAINER },
        { userId: 20, username: 'user20', role: ResourceIntroducerType.INTRODUCER },
      ]);
      expect(JSON.stringify(names)).not.toContain('@example.test');
    });

    it('lists someone holding both roles once, as introducer, whichever grant comes first', async () => {
      withGrants(
        [grant(1, 10, ResourceIntroducerType.MAINTAINER)],
        [grant(2, 10, ResourceIntroducerType.INTRODUCER, true)],
      );
      expect(await fixture.service.getNames(1)).toEqual([
        { userId: 10, username: 'user10', role: ResourceIntroducerType.INTRODUCER },
      ]);
    });

    it('skips grants whose user is gone', async () => {
      withGrants([{ ...grant(1, 10, ResourceIntroducerType.INTRODUCER), user: null }], []);
      expect(await fixture.service.getNames(1)).toEqual([]);
    });
  });

  describe('canViewAccessLists (ATT-1149)', () => {
    const user = (permissions: string[]) => ({ id: 10, effectivePermissions: new Set(permissions) }) as never;

    it.each([['resources.update'], ['resources.access.manage']])('lets %s read the lists', async (permission) => {
      const isIntroducer = jest.spyOn(fixture.service, 'isIntroducer').mockResolvedValue(false);
      expect(await fixture.service.canViewAccessLists(1, user([permission]))).toBe(true);
      expect(isIntroducer).not.toHaveBeenCalled();
    });

    it('lets introducers of the resource or one of its groups read the lists', async () => {
      const isIntroducer = jest.spyOn(fixture.service, 'isIntroducer').mockResolvedValue(true);
      expect(await fixture.service.canViewAccessLists(1, user(['resources.read']))).toBe(true);
      expect(isIntroducer).toHaveBeenCalledWith(1, 10, true);
    });

    it('refuses everyone else', async () => {
      jest.spyOn(fixture.service, 'isIntroducer').mockResolvedValue(false);
      expect(await fixture.service.canViewAccessLists(1, user(['resources.read']))).toBe(false);
    });
  });

  describe('getMany', () => {
    const user = (id: number) => ({ id }) as never;

    it('returns both direct and group-inherited introducers, deduped by user', async () => {
      const direct = grantRecord({ id: 1, userId: 10, user: user(10) });
      const group = grantRecord({ id: 2, userId: 20, resourceId: null, resourceGroupId: 5, user: user(20) });
      fixture.store.listDirect.mockResolvedValue([direct]);
      fixture.store.listViaGroups.mockResolvedValue([group]);

      expect(await fixture.service.getMany(1)).toEqual([direct, group]);
    });

    it('does not list the same role twice when it is granted directly and through a group', async () => {
      const direct = grantRecord({ id: 1, userId: 10, user: user(10) });
      const group = grantRecord({ id: 2, userId: 10, resourceId: null, resourceGroupId: 5, user: user(10) });
      fixture.store.listDirect.mockResolvedValue([direct]);
      fixture.store.listViaGroups.mockResolvedValue([group]);

      expect(await fixture.service.getMany(1)).toEqual([direct]);
    });

    it('lists both roles granted to the same user and passes the type filter on', async () => {
      const introducer = grantRecord({ id: 1, userId: 10, user: user(10) });
      const maintainer = grantRecord({ id: 2, userId: 10, type: ResourceIntroducerType.MAINTAINER, user: user(10) });
      fixture.store.listDirect.mockResolvedValue([introducer, maintainer]);

      expect(await fixture.service.getMany(1, ResourceIntroducerType.INTRODUCER)).toEqual([introducer, maintainer]);
      expect(fixture.store.listDirect).toHaveBeenCalledWith(1, ResourceIntroducerType.INTRODUCER);
      expect(fixture.store.listViaGroups).toHaveBeenCalledWith(1, ResourceIntroducerType.INTRODUCER);
    });

    it('skips grants whose user is gone', async () => {
      fixture.store.listDirect.mockResolvedValue([grantRecord({ id: 1, user: null })]);
      expect(await fixture.service.getMany(1)).toEqual([]);
    });
  });

  describe('getManyForResources', () => {
    it('batches direct and group introducers and groups them by resource', async () => {
      const direct = grantRecord({ id: 1, userId: 10, user: { id: 10 } as never });
      const group = grantRecord({
        id: 2,
        userId: 20,
        resourceId: null,
        resourceGroupId: 5,
        user: { id: 20 } as never,
      });
      fixture.store.listDirectForResources.mockResolvedValue([direct]);
      fixture.store.listViaGroupsForResources.mockResolvedValue([
        { resourceId: 1, grant: group },
        { resourceId: 2, grant: group },
      ]);

      const result = await fixture.service.getManyForResources([1, 2, 2], ResourceIntroducerType.INTRODUCER);

      expect(fixture.store.listDirectForResources).toHaveBeenCalledWith([1, 2], ResourceIntroducerType.INTRODUCER);
      expect(result).toEqual(
        new Map([
          [1, [direct, group]],
          [2, [group]],
        ]),
      );
    });

    it('lets a group grant replace a direct grant of the same user, and skips the queries for an empty list', async () => {
      const direct = grantRecord({ id: 1, userId: 10, user: { id: 10 } as never });
      const group = grantRecord({ id: 2, userId: 10, resourceId: null, resourceGroupId: 5, user: { id: 10 } as never });
      fixture.store.listDirectForResources.mockResolvedValue([direct]);
      fixture.store.listViaGroupsForResources.mockResolvedValue([{ resourceId: 1, grant: group }]);
      expect(await fixture.service.getManyForResources([1])).toEqual(new Map([[1, [group]]]));

      fixture.store.listDirectForResources.mockClear();
      expect(await fixture.service.getManyForResources([])).toEqual(new Map());
      expect(fixture.store.listDirectForResources).not.toHaveBeenCalled();
    });
  });

  describe('isIntroducer', () => {
    it('returns true for a direct introducer row', async () => {
      fixture.store.findDirect.mockResolvedValue(grantRecord({ id: 1 }));
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(true);
    });

    it('asks only for introducer rows, so a maintainer row does not count', async () => {
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(false);
      expect(fixture.store.findDirect).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER, undefined);
    });

    it('falls back to group grants only when asked to', async () => {
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(false);
      expect(fixture.store.hasGroupGrant).not.toHaveBeenCalled();
      fixture.store.hasGroupGrant.mockResolvedValue(true);
      const context = fakeTransactionScope();
      await expect(fixture.service.isIntroducer(1, 2, true, context)).resolves.toBe(true);
      expect(fixture.store.hasGroupGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER, context);
    });
  });

  describe('canMaintain', () => {
    it('returns true for a maintainer or an introducer row', async () => {
      fixture.store.findDirect.mockResolvedValue(grantRecord({ id: 1, type: ResourceIntroducerType.MAINTAINER }));
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(true);
      expect(fixture.store.findDirect).toHaveBeenCalledWith(1, 2, undefined, undefined);
    });

    it('returns false when there is no row', async () => {
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(false);
    });

    it('checks the groups of the resource for any role', async () => {
      fixture.store.hasGroupGrant.mockResolvedValue(true);
      await expect(fixture.service.canMaintain(1, 2, true)).resolves.toBe(true);
      expect(fixture.store.hasGroupGrant).toHaveBeenCalledWith(1, 2, null, undefined);
    });
  });

  describe('grant', () => {
    it('creates a maintainer row when none exists', async () => {
      fixture.store.insert.mockImplementation(async (resourceId, userId, type) =>
        grantRecord({ id: 5, resourceId, userId, type }),
      );

      const result = await fixture.service.grant(1, 2, ResourceIntroducerType.MAINTAINER);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.store.insert).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.MAINTAINER);
      expect(result.type).toBe(ResourceIntroducerType.MAINTAINER);
      expect(fixture.eventEmitter.emit).toHaveBeenCalled();
      expect(fixture.notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [expect.objectContaining({ id: 2 })],
          title: expect.any(Function),
          body: expect.any(Function),
          url: '/resources/1',
          sendEmail: expect.any(Function),
        }),
      );
      const request = fixture.notifications.dispatch.mock.calls[0][0];
      const enUser = { locale: 'en' } as User;
      expect(request.title(enUser)).toBe('Your resource access changed');
      expect(request.body(enUser)).toBe('You were made a maintainer for resource #1.');
      await request.sendEmail({ id: 2, email: 'user@example.com', locale: 'en' } as User);
      expect(fixture.notifications.sendEmailTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2 }),
        NotificationCategory.ACCESS_CHANGES,
        {
          accessChange: {
            title: 'Your resource access changed',
            body: 'You were made a maintainer for resource #1.',
            url: '/resources/1',
          },
        },
      );
    });

    it('defaults to introducer when no type is provided', async () => {
      fixture.store.insert.mockImplementation(async (resourceId, userId, type) =>
        grantRecord({ id: 5, resourceId, userId, type }),
      );

      await fixture.service.grant(1, 2);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.store.insert).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER);
      const defaultsReq = fixture.notifications.dispatch.mock.calls[0][0];
      expect(defaultsReq.body({ locale: 'en' } as User)).toBe('You were made an introducer for resource #1.');
    });

    it('creates a second row when the user already holds the other role', async () => {
      fixture.store.findDirect.mockImplementation(async (_resourceId, _userId, type) =>
        type === ResourceIntroducerType.MAINTAINER ? grantRecord({ id: 9, type }) : null,
      );
      fixture.store.insert.mockImplementation(async (resourceId, userId, type) =>
        grantRecord({ id: 5, resourceId, userId, type }),
      );

      const result = await fixture.service.grant(1, 2, ResourceIntroducerType.INTRODUCER);
      await Promise.resolve(); // flush notification promise chain

      expect(result.type).toBe(ResourceIntroducerType.INTRODUCER);
      expect(fixture.store.findDirect).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER, undefined);
      expect(fixture.store.insert).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER);
      expect(fixture.eventEmitter.emit).toHaveBeenCalled();
    });

    it('does not re-save when the existing row already matches', async () => {
      const existing = grantRecord({ id: 4 });
      fixture.store.findDirect.mockResolvedValue(existing);

      expect(await fixture.service.grant(1, 2, ResourceIntroducerType.INTRODUCER)).toBe(existing);

      expect(fixture.store.insert).not.toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
      expect(fixture.notifications.dispatch).not.toHaveBeenCalled();
    });

    it('returns the concurrent grant when the insert lost a race', async () => {
      const concurrent = grantRecord({ id: 6 });
      fixture.store.findDirect.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrent);
      fixture.store.insert.mockRejectedValue(new Error('UNIQUE constraint failed'));

      expect(await fixture.service.grant(1, 2)).toBe(concurrent);
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rethrows an insert failure when no concurrent grant exists', async () => {
      fixture.store.insert.mockRejectedValue(new Error('disk full'));
      await expect(fixture.service.grant(1, 2)).rejects.toThrow('disk full');
    });
  });

  describe('revoke', () => {
    it('notifies the user when resource introducer or maintainer access is revoked', async () => {
      fixture.store.findDirect.mockResolvedValue(
        grantRecord({ id: 8, userId: 2, type: ResourceIntroducerType.MAINTAINER }),
      );

      await fixture.service.revoke(1, 2, ResourceIntroducerType.MAINTAINER);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.store.findDirect).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.MAINTAINER, undefined);
      expect(fixture.store.remove).toHaveBeenCalledWith(8);

      const revokeReq = fixture.notifications.dispatch.mock.calls[0][0];
      expect(revokeReq.category).toBe(NotificationCategory.ACCESS_CHANGES);
      expect(revokeReq.recipients).toEqual([expect.objectContaining({ id: 2 })]);
      expect(revokeReq.url).toBe('/resources/1');
      expect(revokeReq.body({ locale: 'en' } as User)).toBe('Your maintainer status for resource #1 was revoked.');
    });

    it('does nothing when there is no grant', async () => {
      await fixture.service.revoke(1, 2);
      expect(fixture.store.remove).not.toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
