import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { registerResourceIntroducersServiceFixture } from './resourceIntroducers.service.resource-introducers-service.test-fixture';
import { NotificationCategory } from '../../notifications/notification-types';

export function registerCanMaintainCases(fixture: ReturnType<typeof registerResourceIntroducersServiceFixture>) {
  describe('canMaintain', () => {
    it('returns true for a maintainer row', async () => {
      fixture.repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.MAINTAINER } as ResourceIntroducer);
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(true);
    });

    it('returns true for an introducer row', async () => {
      fixture.repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer);
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(true);
    });

    it('returns false when there is no row', async () => {
      fixture.repository.findOne.mockResolvedValue(null);
      await expect(fixture.service.canMaintain(1, 2, false)).resolves.toBe(false);
    });
  });
}

export function registerGetManyForResourcesCases(
  fixture: ReturnType<typeof registerResourceIntroducersServiceFixture>,
) {
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
      fixture.repository.find.mockResolvedValue([directIntroducer]);

      const groupQuery = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn().mockResolvedValue({
          raw: [
            { introducer_id: 2, resourceId: 1 },
            { introducer_id: 2, resourceId: 2 },
          ],
          entities: [groupIntroducer],
        }),
      };
      fixture.repository.createQueryBuilder.mockReturnValue(groupQuery);

      const result = await fixture.service.getManyForResources([1, 2], ResourceIntroducerType.INTRODUCER);

      expect(fixture.repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['user'],
          where: expect.objectContaining({ type: ResourceIntroducerType.INTRODUCER }),
        }),
      );
      expect(groupQuery.where).toHaveBeenCalledWith('resource.id IN (:...resourceIds)', { resourceIds: [1, 2] });
      expect(result).toEqual(
        new Map([
          [1, [directIntroducer, groupIntroducer]],
          [2, [groupIntroducer]],
        ]),
      );
    });
  });
}

export function registerGetManyCases(fixture: ReturnType<typeof registerResourceIntroducersServiceFixture>) {
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

      fixture.repository.find.mockResolvedValue([directIntroducer]);

      const groupQuery = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([groupIntroducer]),
      };
      fixture.repository.createQueryBuilder.mockReturnValue(groupQuery);

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

      fixture.repository.find.mockResolvedValue([directIntroducer]);

      const groupQuery = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([groupIntroducer]),
      };
      fixture.repository.createQueryBuilder.mockReturnValue(groupQuery);

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
      fixture.repository.find.mockResolvedValue([introducer, maintainer]);

      const result = await fixture.service.getMany(1);

      expect(result).toEqual([introducer, maintainer]);
    });
  });
}

export function registerIsIntroducerCases(fixture: ReturnType<typeof registerResourceIntroducersServiceFixture>) {
  describe('isIntroducer', () => {
    it('returns true for a direct introducer row', async () => {
      fixture.repository.findOne.mockResolvedValue({ type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer);
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(true);
    });

    it('returns false for a maintainer row (maintainers cannot give introductions)', async () => {
      fixture.repository.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.type === ResourceIntroducerType.MAINTAINER ? ({ type: where.type } as ResourceIntroducer) : null,
        ),
      );
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(false);
      expect(fixture.repository.findOne).toHaveBeenCalledWith({
        where: { resourceId: 1, userId: 2, type: ResourceIntroducerType.INTRODUCER },
      });
    });

    it('returns false when there is no row', async () => {
      fixture.repository.findOne.mockResolvedValue(null);
      await expect(fixture.service.isIntroducer(1, 2, false)).resolves.toBe(false);
    });
  });
}

export function registerRevokeCases(fixture: ReturnType<typeof registerResourceIntroducersServiceFixture>) {
  describe('revoke', () => {
    it('notifies the user when resource introducer or maintainer access is revoked', async () => {
      fixture.repository.findOne.mockResolvedValue({
        userId: 2,
        type: ResourceIntroducerType.MAINTAINER,
      } as ResourceIntroducer);
      fixture.repository.remove.mockImplementation(async (data) => data);

      await fixture.service.revoke(1, 2, ResourceIntroducerType.MAINTAINER);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.repository.findOne).toHaveBeenCalledWith({
        where: { resourceId: 1, userId: 2, type: ResourceIntroducerType.MAINTAINER },
      });

      const revokeReq = fixture.notifications.dispatch.mock.calls[0][0];
      expect(revokeReq.category).toBe(NotificationCategory.ACCESS_CHANGES);
      expect(revokeReq.recipients).toEqual([expect.objectContaining({ id: 2 })]);
      expect(revokeReq.url).toBe('/resources/1');
      expect(revokeReq.body({ locale: 'en' } as User)).toBe('Your maintainer status for resource #1 was revoked.');
    });
  });
}
