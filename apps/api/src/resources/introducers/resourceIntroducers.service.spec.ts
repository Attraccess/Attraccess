import { registerResourceIntroducersServiceFixture } from './resourceIntroducers.service.resource-introducers-service.test-fixture';
import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/application-models';
import { NotificationCategory } from './../../notifications/notification-types';

describe('ResourceIntroducersService', () => {
  const fixture = registerResourceIntroducersServiceFixture();

  describe('getMany', () => {
    it('returns both direct and group-inherited introducers, deduped by user', async () => {
      const directIntroducer = {
        id: 1,
        userId: 10,
        resourceId: 1,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;
      const groupIntroducer = {
        id: 2,
        userId: 20,
        resourceGroupId: 5,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 20 },
      } as unknown as ResourceIntroducer;

      fixture.persistence.directGrants.mockResolvedValue([directIntroducer]);

      fixture.persistence.groupGrants.mockResolvedValue([groupIntroducer]);

      const result = await fixture.service.getMany(1);

      expect(result).toEqual([directIntroducer, groupIntroducer]);
    });

    it('does not list the same role twice when it is granted directly and through a group', async () => {
      const directIntroducer = {
        id: 1,
        userId: 10,
        resourceId: 1,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;
      const groupIntroducer = {
        id: 2,
        userId: 10,
        resourceGroupId: 5,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;

      fixture.persistence.directGrants.mockResolvedValue([directIntroducer]);

      fixture.persistence.groupGrants.mockResolvedValue([groupIntroducer]);

      const result = await fixture.service.getMany(1);

      expect(result).toEqual([directIntroducer]);
    });

    it('lists both roles granted to the same user', async () => {
      const introducer = {
        id: 1,
        userId: 10,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as ResourceIntroducer;
      const maintainer = {
        id: 2,
        userId: 10,
        type: ResourceIntroducerType.MAINTAINER,
        user: { id: 10 },
      } as ResourceIntroducer;
      fixture.persistence.directGrants.mockResolvedValue([introducer, maintainer]);

      const result = await fixture.service.getMany(1);

      expect(result).toEqual([introducer, maintainer]);
    });
  });

  describe('getManyForResources', () => {
    it('batches direct and group introducers and groups them by resource', async () => {
      const directIntroducer = {
        id: 1,
        userId: 10,
        resourceId: 1,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 10 },
      } as unknown as ResourceIntroducer;
      const groupIntroducer = {
        id: 2,
        userId: 20,
        resourceGroupId: 5,
        type: ResourceIntroducerType.INTRODUCER,
        user: { id: 20 },
      } as unknown as ResourceIntroducer;
      fixture.persistence.directGrants.mockResolvedValue([directIntroducer]);

      fixture.persistence.inheritedGrants.mockResolvedValue([
        { resourceId: 1, grant: groupIntroducer },
        { resourceId: 2, grant: groupIntroducer },
      ]);

      const result = await fixture.service.getManyForResources([1, 2], ResourceIntroducerType.INTRODUCER);

      expect(fixture.persistence.directGrants).toHaveBeenCalledWith([1, 2], ResourceIntroducerType.INTRODUCER);
      expect(fixture.persistence.inheritedGrants).toHaveBeenCalledWith([1, 2], ResourceIntroducerType.INTRODUCER);
      expect(result).toEqual(
        new Map([
          [1, [directIntroducer, groupIntroducer]],
          [2, [groupIntroducer]],
        ]),
      );
    });
  });

  describe('isIntroducer', () => {
    it('returns true for a direct introducer row', async () => {
      fixture.persistence.directGrant.mockResolvedValue({
        type: ResourceIntroducerType.INTRODUCER,
      } as ResourceIntroducer);
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(true);
    });

    it('returns false for a maintainer row (maintainers cannot give introductions)', async () => {
      fixture.persistence.directGrant.mockImplementation((_resourceId, _userId, type) =>
        Promise.resolve(type === ResourceIntroducerType.MAINTAINER ? ({ type: type } as ResourceIntroducer) : null),
      );
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(false);
      expect(fixture.persistence.directGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER);
    });

    it('returns false when there is no row', async () => {
      fixture.persistence.directGrant.mockResolvedValue(null);
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(false);
    });
  });

  describe('canMaintain', () => {
    it('returns true for a maintainer row', async () => {
      fixture.persistence.directGrant.mockResolvedValue({
        type: ResourceIntroducerType.MAINTAINER,
      } as ResourceIntroducer);
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(true);
    });

    it('returns true for an introducer row', async () => {
      fixture.persistence.directGrant.mockResolvedValue({
        type: ResourceIntroducerType.INTRODUCER,
      } as ResourceIntroducer);
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(true);
    });

    it('returns false when there is no row', async () => {
      fixture.persistence.directGrant.mockResolvedValue(null);
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(false);
    });
  });

  describe('grant', () => {
    it('creates a maintainer row when none exists', async () => {
      fixture.persistence.directGrant.mockResolvedValue(null);

      const result = await fixture.service.grant(1, 2, ResourceIntroducerType.MAINTAINER);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.persistence.createGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.MAINTAINER);
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
      fixture.persistence.directGrant.mockResolvedValue(null);

      await fixture.service.grant(1, 2);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.persistence.createGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER);
      const defaultsReq = fixture.notifications.dispatch.mock.calls[0][0];
      expect(defaultsReq.body({ locale: 'en' } as User)).toBe('You were made an introducer for resource #1.');
    });

    it('creates a second row when the user already holds the other role', async () => {
      fixture.persistence.directGrant.mockImplementation((_resourceId, _userId, type) =>
        Promise.resolve(type === ResourceIntroducerType.MAINTAINER ? ({ type: type } as ResourceIntroducer) : null),
      );

      const result = await fixture.service.grant(1, 2, ResourceIntroducerType.INTRODUCER);
      await Promise.resolve(); // flush notification promise chain

      expect(result.type).toBe(ResourceIntroducerType.INTRODUCER);
      expect(fixture.persistence.directGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER);
      expect(fixture.persistence.createGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.INTRODUCER);
      expect(fixture.eventEmitter.emit).toHaveBeenCalled();
    });

    it('does not re-save when the existing row already matches', async () => {
      const existing = { type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer;
      fixture.persistence.directGrant.mockResolvedValue(existing);

      await fixture.service.grant(1, 2, ResourceIntroducerType.INTRODUCER);

      expect(fixture.persistence.createGrant).not.toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
      expect(fixture.notifications.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('notifies the user when resource introducer or maintainer access is revoked', async () => {
      fixture.persistence.directGrant.mockResolvedValue({
        userId: 2,
        type: ResourceIntroducerType.MAINTAINER,
      } as ResourceIntroducer);

      await fixture.service.revoke(1, 2, ResourceIntroducerType.MAINTAINER);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.persistence.directGrant).toHaveBeenCalledWith(1, 2, ResourceIntroducerType.MAINTAINER);

      const revokeReq = fixture.notifications.dispatch.mock.calls[0][0];
      expect(revokeReq.category).toBe(NotificationCategory.ACCESS_CHANGES);
      expect(revokeReq.recipients).toEqual([expect.objectContaining({ id: 2 })]);
      expect(revokeReq.url).toBe('/resources/1');
      expect(revokeReq.body({ locale: 'en' } as User)).toBe('Your maintainer status for resource #1 was revoked.');
    });
  });
});
