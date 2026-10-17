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
    describe('email lookup with stored case variants', () => {
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
          { id: 7, email: 'Alice@Example.com' },
          { id: 8, email: 'a_btag@Example.com' },
        ]);
        fixture.userRepository.findOne.mockImplementation((options) => repo.findOne(options));
        fixture.userRepository.find.mockImplementation((options) => repo.find(options));
      });

      afterEach(async () => {
        await db.destroy();
      });

      it('matches unambiguous mixed-case emails without wildcard matching', async () => {
        await expect(fixture.service.findByLoginIdentifier(' ALICE@example.COM ')).resolves.toMatchObject({ id: 7 });
        await expect(fixture.service.findByLoginIdentifier('a_bTAG@example.COM')).resolves.toMatchObject({ id: 8 });
        await expect(fixture.service.findByLoginIdentifier('a__tag@example.com')).resolves.toBeNull();
      });

      it.each([
        ['Alice@Example.com', 7],
        ['alice@example.com', 9],
      ])('preserves the exact account for %s when email case variants coexist', async (email, id) => {
        await db.getRepository(schema).save({ id: 9, email: 'alice@example.com' });
        await expect(fixture.service.findByLoginIdentifier(` ${email} `)).resolves.toMatchObject({ id });
      });

      it('does not select an account when a case-insensitive fallback is ambiguous', async () => {
        await db.getRepository(schema).save({ id: 9, email: 'alice@example.com' });
        await expect(fixture.service.findByLoginIdentifier('ALICE@EXAMPLE.COM')).resolves.toBeNull();
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
