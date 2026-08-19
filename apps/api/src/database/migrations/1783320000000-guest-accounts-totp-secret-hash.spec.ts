import { GuestAccountsTotpSecretHash1783320000000 } from './1783320000000-guest-accounts-totp-secret-hash';

describe('GuestAccountsTotpSecretHash1783320000000', () => {
  it('adds a unique partial index for guest TOTP secret hashes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new GuestAccountsTotpSecretHash1783320000000().up({ query } as never);

    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "IDX_authentication_detail_guest_otp_secret_hash" ON "authentication_detail" ("totpSecretHash") WHERE "type" = \'guest_otp\' AND "totpSecretHash" IS NOT NULL',
    );
  });
});
