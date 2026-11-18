import { registerUsersServiceFixture } from '../users.service.users-service.test-fixture';

describe('UsersService', () => {
  const fixture = registerUsersServiceFixture();

  describe('local login identifier lookup', () => {
    it('preserves existing username normalization', async () => {
      const [user] = fixture.store.seed({ id: 7, username: 'alice' });
      const spy = jest.spyOn(fixture.store, 'findUser');

      await expect(fixture.service.findByLoginIdentifier(' Alice ')).resolves.toMatchObject({ id: user.id });
      expect(spy).toHaveBeenCalledWith({ id: undefined, username: 'alice', email: undefined }, false, undefined);
    });

    it('matches mixed-case input against lowercase stored emails', async () => {
      fixture.store.seed(
        { id: 7, username: 'a', email: 'alice@example.com' },
        { id: 8, username: 'b', email: 'a_btag@example.com' },
      );

      await expect(fixture.service.findByLoginIdentifier(' ALICE@example.COM ')).resolves.toMatchObject({ id: 7 });
      await expect(fixture.service.findByLoginIdentifier('a_bTAG@example.COM')).resolves.toMatchObject({ id: 8 });
      // an underscore is a literal character, never a wildcard
      await expect(fixture.service.findByLoginIdentifier('a__tag@example.com')).resolves.toBeNull();
    });

    it.each(['', '  ', 'a@', '@example.com', 'a@@example.com'])(
      'rejects malformed identifier %s without a query',
      async (identifier) => {
        const spy = jest.spyOn(fixture.store, 'findUser');
        await expect(fixture.service.findByLoginIdentifier(identifier)).resolves.toBeNull();
        expect(spy).not.toHaveBeenCalled();
      },
    );
  });
});
