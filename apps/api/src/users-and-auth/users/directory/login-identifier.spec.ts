import { registerUsersServiceFixture } from '../users.service.users-service.test-fixture';
import { User } from '@attraccess/database-entities';
import { DataSource, EntitySchema } from 'typeorm';

describe('UsersService', () => {
  const fixture = registerUsersServiceFixture();

  describe('local login identifier lookup', () => {
    it('preserves existing username normalization', async () => {
      const user = { id: 7 } as User;
      fixture.userRepository.findOne.mockResolvedValue(user);
      await expect(fixture.service.findByLoginIdentifier(' Alice ')).resolves.toBe(user);
      expect(fixture.userRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'alice' },
        relations: undefined,
      });
    });
    describe('email lookup is case-insensitive', () => {
      const schema = new EntitySchema<User>({
        name: 'LoginUser',
        columns: {
          id: { type: Number, primary: true },
          email: { type: String, unique: true },
        },
      });
      let db: DataSource;

      beforeEach(async () => {
        db = await new DataSource({
          type: 'sqlite',
          database: ':memory:',
          entities: [schema],
          synchronize: true,
        }).initialize();
        const repo = db.getRepository(schema);
        await repo.save([
          { id: 7, email: 'alice@example.com' },
          { id: 8, email: 'a_btag@example.com' },
        ]);
        fixture.userRepository.findOne.mockImplementation((options) => repo.findOne(options));
        fixture.userRepository.find.mockImplementation((options) => repo.find(options));
      });

      afterEach(async () => {
        await db.destroy();
      });

      it('matches mixed-case input against lowercase stored emails without wildcard matching', async () => {
        await expect(fixture.service.findByLoginIdentifier(' ALICE@example.COM ')).resolves.toMatchObject({ id: 7 });
        await expect(fixture.service.findByLoginIdentifier('a_bTAG@example.COM')).resolves.toMatchObject({ id: 8 });
        await expect(fixture.service.findByLoginIdentifier('a__tag@example.com')).resolves.toBeNull();
      });
    });
    it.each(['', '  ', 'a@', '@example.com', 'a@@example.com'])(
      'rejects malformed identifier %s without a query',
      async (identifier) => {
        await expect(fixture.service.findByLoginIdentifier(identifier)).resolves.toBeNull();
        expect(fixture.userRepository.findOne).not.toHaveBeenCalled();
      },
    );
  });
});
