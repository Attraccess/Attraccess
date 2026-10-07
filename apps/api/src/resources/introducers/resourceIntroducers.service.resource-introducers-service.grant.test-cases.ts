import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { NotificationCategory } from '../../notifications/notification-types';
import { registerResourceIntroducersServiceFixture } from './resourceIntroducers.service.resource-introducers-service.test-fixture';
export function registerGrantCases(fixture: ReturnType<typeof registerResourceIntroducersServiceFixture>) {
  describe('grant', () => {
    it('creates a maintainer row when none exists', async () => {
      fixture.repository.findOne.mockResolvedValue(null);
      fixture.repository.create.mockImplementation((data) => data);
      fixture.repository.save.mockImplementation(async (data) => data);

      const result = await fixture.service.grant(1, 2, ResourceIntroducerType.MAINTAINER);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.repository.create).toHaveBeenCalledWith({
        resourceId: 1,
        userId: 2,
        type: ResourceIntroducerType.MAINTAINER,
      });
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
      fixture.repository.findOne.mockResolvedValue(null);
      fixture.repository.create.mockImplementation((data) => data);
      fixture.repository.save.mockImplementation(async (data) => data);

      await fixture.service.grant(1, 2);
      await Promise.resolve(); // flush notification promise chain

      expect(fixture.repository.create).toHaveBeenCalledWith({
        resourceId: 1,
        userId: 2,
        type: ResourceIntroducerType.INTRODUCER,
      });
      const defaultsReq = fixture.notifications.dispatch.mock.calls[0][0];
      expect(defaultsReq.body({ locale: 'en' } as User)).toBe('You were made an introducer for resource #1.');
    });

    it('creates a second row when the user already holds the other role', async () => {
      fixture.repository.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.type === ResourceIntroducerType.MAINTAINER ? ({ type: where.type } as ResourceIntroducer) : null,
        ),
      );
      fixture.repository.create.mockImplementation((data) => data);
      fixture.repository.save.mockImplementation(async (data) => data);

      const result = await fixture.service.grant(1, 2, ResourceIntroducerType.INTRODUCER);
      await Promise.resolve(); // flush notification promise chain

      expect(result.type).toBe(ResourceIntroducerType.INTRODUCER);
      expect(fixture.repository.findOne).toHaveBeenCalledWith({
        where: { resourceId: 1, userId: 2, type: ResourceIntroducerType.INTRODUCER },
      });
      expect(fixture.repository.create).toHaveBeenCalledWith({
        resourceId: 1,
        userId: 2,
        type: ResourceIntroducerType.INTRODUCER,
      });
      expect(fixture.eventEmitter.emit).toHaveBeenCalled();
    });

    it('does not re-save when the existing row already matches', async () => {
      const existing = { type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer;
      fixture.repository.findOne.mockResolvedValue(existing);

      await fixture.service.grant(1, 2, ResourceIntroducerType.INTRODUCER);

      expect(fixture.repository.save).not.toHaveBeenCalled();
      expect(fixture.eventEmitter.emit).not.toHaveBeenCalled();
      expect(fixture.notifications.dispatch).not.toHaveBeenCalled();
    });
  });
}
