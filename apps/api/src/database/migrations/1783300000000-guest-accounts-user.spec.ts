import { GuestAccountsUser1783300000000 } from './1783300000000-guest-accounts-user';

describe('GuestAccountsUser1783300000000', () => {
  it('removes guest-owned dependent records before dropping guest users on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new GuestAccountsUser1783300000000().down({ query } as never);

    const statements = query.mock.calls.map(([statement]) => statement as string);
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DELETE FROM "resource_introduction_history_item"'),
        expect.stringContaining('DELETE FROM "resource_introduction"'),
        expect.stringContaining('DELETE FROM "form_submission"'),
        expect.stringContaining('DELETE FROM "billing_transaction_item"'),
        expect.stringContaining('DELETE FROM "billing_transaction"'),
        expect.stringContaining('DELETE FROM "resource_usage"'),
      ]),
    );
  });
});
