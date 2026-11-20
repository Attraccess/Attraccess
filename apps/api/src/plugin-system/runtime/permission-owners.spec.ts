import { Logger } from '@nestjs/common';
import { loadRecordedPermissionOwners } from './permission-owners';

describe('loadRecordedPermissionOwners', () => {
  it("returns the backend's owners", async () => {
    const owners = new Map([['acme.widgets.read', 'acme']]);
    expect(await loadRecordedPermissionOwners(async () => owners)).toBe(owners);
  });

  it('fails closed with no owners and logs when the backend cannot read them', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      loadRecordedPermissionOwners(async () => {
        throw new Error('disk I/O error');
      }),
    ).resolves.toEqual(new Map());
    expect(error).toHaveBeenCalledWith(expect.stringContaining('disk I/O error'));
    error.mockRestore();
  });
});
