import {
  seedAwaitingVerificationSession,
  seedClaimedController,
  type ManagedRuntimeFixture,
} from './runtime/managed/setup.test-fixture';
export async function initializeCutover(scope: ManagedRuntimeFixture, remoteStatus: string) {
  const current = await seedClaimedController(scope.store);
  await seedAwaitingVerificationSession(scope);
  await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
  await scope.store.tables.managedAccess.update(
    { sessionId: 1 },
    {
      controllerId: 1,
      state: remoteStatus === 'new-server-runtime' ? 'verified' : 'recovery_required',
    },
  );
  return current;
}
