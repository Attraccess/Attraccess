import { RootTestRegistrationsTestScope } from './runtime-entrypoints.spec';
export function registerRootTestRegistrationsRestoresPersistedIdentityAndRejectsAConflictingHardwareId(
  scope: RootTestRegistrationsTestScope,
): void {
  test('restores persisted identity and rejects a conflicting hardware ID', async () => {
    scope.mockState = { simulatorHardwareId: 'other-device', credentials: { username: 'u', password: 'p' } };
    await scope.boot();
    expect(process.exitCode).toBe(1);
    expect(scope.mockClients).toHaveLength(0);
  });
}
