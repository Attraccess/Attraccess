import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { managedSsh } from './wago-managed-ssh';
import { commissioningVerification } from './wago-commissioning-verification';
import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
import { initializeCutover } from './wago-cutover.setup.test-fixture';

export function registerManagedEnrolmentAndDurableCredentialLifecycleReconcilesSCutoverWithRebootProofBeforeANewCommit(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it.each([
    'committed',
    'open',
    'new-server-runtime',
    'retiring',
    'slow-preparation',
    'slow-cutover',
    'acceptance-failed',
    'slow-policy',
    'bootstrap-acceptance',
    'stuck-cutover',
  ] as const)(
    'reconciles %s cutover with reboot proof before a new commit',
    async (remoteStatus) => {
      const current = await initializeCutover(scope, remoteStatus);
      const now = Date.now();
      scope.service['heartbeats'].set(1, {
        imageId: scope.artifact.imageId,
        streamId: 'boot-new',
        timestamp: now,
        receivedAt: now,
      });
      scope.service['readiness'].observe = jest.fn(() => ({
        timestamp: now,
        streamId: 'boot-new',
        sequence: 1,
        revision: 1,
        contentHash: 'a'.repeat(64),
        connected: true,
        configurationAccepted: true,
        hardwareAvailable: true,
        ready: true,
      }));
      jest.mocked(commissioningVerification).mockResolvedValue({
        controllerId: 1,
        permanentConnection: true,
        enrollmentRevoked: true,
        configurationApplied: true,
        hardwareReadiness: 'ready',
        managementHardening: 'unverified',
        physicalQualification: 'required',
        ready: false,
      });
      if (remoteStatus === 'retiring') {
        const operations = scope.service['operations'];
        const acquire = operations.acquire.bind(operations);
        jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
          await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
          return acquire(...args);
        });
        jest.mocked(managedSsh).mockClear();
        expect(await scope.service['completeEnrolment'](current)).toBe(false);
        expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
        expect((await scope.service.sessionStatus(1)).management).toBe('retiring');
        return;
      }
      const open =
        remoteStatus === 'new-server-runtime' ||
        remoteStatus === 'open' ||
        remoteStatus === 'slow-preparation' ||
        remoteStatus === 'slow-cutover' ||
        remoteStatus === 'acceptance-failed' ||
        remoteStatus === 'slow-policy' ||
        remoteStatus === 'bootstrap-acceptance';
      scope.rootProbe.mockResolvedValue(open);
      const bootstrapAcceptance = jest.fn(async (_host, _fingerprint, _password, _token, guard) => {
        await guard.assertOwned();
        expect(guard.signal.aborted).toBe(false);
      });
      if (remoteStatus === 'bootstrap-acceptance') scope.service.registerPreparationAcceptance(bootstrapAcceptance);
      let preparationStarted!: () => void;
      let cutoverStarted!: () => void;
      let rebootStarted!: () => void;
      let policyStarted!: () => void;
      const preparing = new Promise<void>((resolve) => {
        preparationStarted = resolve;
      });
      const cuttingOver = new Promise<void>((resolve) => {
        cutoverStarted = resolve;
      });
      const rebooting = new Promise<void>((resolve) => {
        rebootStarted = resolve;
      });
      const checkingPolicy = new Promise<void>((resolve) => {
        policyStarted = resolve;
      });
      let slowStepAborted = false;
      let boot = '00000000-0000-4000-8000-000000000001\n';
      jest.mocked(managedSsh).mockImplementation(async (_access, _key, header, signal) => {
        if (header.startsWith('access-status '))
          return (open ? 'open' : remoteStatus === 'stuck-cutover' ? 'cutover' : remoteStatus) + '\n';
        if (remoteStatus === 'stuck-cutover' && header.startsWith('access-restore '))
          throw new RuntimeUpdateError('lock_tools');
        if (remoteStatus === 'slow-preparation' && header.startsWith('access-key-commit ')) {
          preparationStarted();
          await new Promise((resolve) => setTimeout(resolve, 200_000));
          slowStepAborted = signal.aborted;
          signal.throwIfAborted();
        }
        if (remoteStatus === 'slow-policy' && header.startsWith('access-policy ')) {
          policyStarted();
          await new Promise((resolve) => setTimeout(resolve, 200_000));
          signal.throwIfAborted();
        }
        if (remoteStatus === 'acceptance-failed' && header.startsWith('commissioning-accept '))
          throw new Error('internal detail with a secret must not be persisted');
        if (header.startsWith('access-cutover ')) {
          expect(await scope.service.status(1)).toMatchObject({
            managementSetup: { state: 'running', reason: 'ssh_cutover' },
          });
          scope.rootProbe.mockResolvedValue(false);
          cutoverStarted();
          if (remoteStatus === 'slow-cutover') {
            await new Promise((resolve) => setTimeout(resolve, 200_000));
            slowStepAborted = signal.aborted;
            signal.throwIfAborted();
          }
        }
        if (header.startsWith('access-boot ')) return boot;
        if (header.startsWith('access-reboot ')) {
          expect(await scope.service.status(1)).toMatchObject({
            managementSetup: { state: 'running', reason: 'reboot' },
          });
          boot = '00000000-0000-4000-8000-000000000002\n';
          rebootStarted();
        }
        return header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n';
      });
      if (remoteStatus === 'new-server-runtime') {
        const oldImage = `sha256:${'0'.repeat(64)}`;
        const heartbeat = scope.service['heartbeats'].get(1);
        if (!heartbeat) throw new Error('Missing enrollment heartbeat');
        heartbeat.imageId = oldImage;
        const publishPolicy = jest.fn(async (_id: number, desired: string, observed: string) => {
          scope.service['readiness'].observe = jest.fn(() => ({
            timestamp: now,
            streamId: 'boot-new',
            sequence: 1,
            revision: 1,
            contentHash: 'a'.repeat(64),
            connected: true,
            configurationAccepted: true,
            hardwareAvailable: true,
            ready: desired === observed,
          }));
        });
        scope.service['wago'].setRuntimePolicy = publishPolicy;
        scope.service['wago'].blockRuntime = jest.fn();
        await scope.service['refreshRuntimePolicy'](1);
        expect(publishPolicy).toHaveBeenLastCalledWith(1, oldImage, oldImage, undefined);
        expect(scope.service['wago'].blockRuntime).toHaveBeenCalledWith(1);
      }
      if (remoteStatus === 'stuck-cutover') {
        expect(await scope.service['completeEnrolment'](current)).toBe(false);
        expect(await scope.service.status(1)).toMatchObject({
          management: 'recovery_required',
          managementFailure: expect.stringContaining('Automatic SSH setup failed (rollback).'),
        });
        expect(
          (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason,
        ).toContain('lock option unsupported');
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-commit '))).toBe(false);
        return;
      }
      if (remoteStatus === 'acceptance-failed') {
        expect(await scope.service['completeEnrolment'](current)).toBe(false);
        const failure = (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 }))
          .failureReason;
        expect(failure).toContain('Automatic SSH setup failed (acceptance).');
        expect(failure).toContain('retained transaction records');
        expect(failure).not.toContain('secret');
        expect(await scope.service.status(1)).toMatchObject({
          management: 'recovery_required',
          managementFailure: failure,
        });
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-cutover '))).toBe(false);
        // A transient offline status probe on the next scan must not replace
        // the useful failure from the last audited setup attempt.
        jest.mocked(managedSsh).mockRejectedValue(new RuntimeUpdateError('offline'));
        expect(await scope.service['completeEnrolment'](current)).toBe(false);
        expect((await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toBe(
          failure,
        );
        jest.mocked(managedSsh).mockRejectedValue(new RuntimeUpdateError('host_identity'));
        expect(await scope.service['completeEnrolment'](current)).toBe(false);
        expect(
          (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason,
        ).toContain('SSH host key differs');
        return;
      }
      if (remoteStatus === 'slow-policy') {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
          const completion = scope.service['completeEnrolment'](current);
          await cuttingOver;
          await jest.advanceTimersByTimeAsync(3000);
          await checkingPolicy;
          await jest.advanceTimersByTimeAsync(200_000);
          expect(await completion).toBe(false);
          expect(await scope.service.status(1)).toMatchObject({
            management: 'recovery_required',
            managementFailure: expect.stringContaining('Automatic SSH setup failed (policy).'),
          });
          expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-commit '))).toBe(false);
        } finally {
          jest.useRealTimers();
        }
        return;
      }
      if (remoteStatus === 'slow-preparation' || remoteStatus === 'slow-cutover') {
        // A legitimate supervisor gate can hold install.lock for up to 300s.
        // Waiting for it must not consume the later SSH rollback window.
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
          const completion = scope.service['completeEnrolment'](current);
          await (remoteStatus === 'slow-preparation' ? preparing : cuttingOver);
          await jest.advanceTimersByTimeAsync(200_000);
          if (slowStepAborted) {
            expect(await completion).toBe(true);
            return;
          }
          await cuttingOver;
          await jest.advanceTimersByTimeAsync(3000);
          await rebooting;
          await jest.advanceTimersByTimeAsync(1000);
          expect(await completion).toBe(true);
        } finally {
          jest.useRealTimers();
        }
      } else expect(await scope.service['completeEnrolment'](current)).toBe(true);
      if (remoteStatus === 'bootstrap-acceptance') {
        expect(bootstrapAcceptance).toHaveBeenCalledTimes(1);
        expect(bootstrapAcceptance.mock.calls[0].slice(0, 2)).toEqual([
          scope.session().targetHost,
          scope.session().hostKeyFingerprint,
        ]);
        expect(bootstrapAcceptance.mock.calls[0][3]).toBe('a'.repeat(32));
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('commissioning-accept '))).toBe(
          false,
        );
      }
      expect(await scope.service.status(1)).not.toHaveProperty('managementSetup');
      expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
        state: 'managed',
      });
      expect(await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
        state: 'completed',
        deliveryToken: null,
      });
      if (remoteStatus === 'new-server-runtime') {
        await scope.service['refreshRuntimePolicy'](1);
        expect(scope.service['wago'].setRuntimePolicy).toHaveBeenLastCalledWith(
          1,
          scope.artifact.imageId,
          `sha256:${'0'.repeat(64)}`,
          undefined,
        );
      }
      const commands = jest.mocked(managedSsh).mock.calls.map((call) => call[2].split(' ')[0]);
      if (remoteStatus === 'committed') expect(commands).not.toContain('access-cutover');
      else {
        expect(commands.indexOf('access-reboot')).toBeLessThan(commands.indexOf('access-commit'));
        expect(commands.filter((command) => command === 'access-boot')).toHaveLength(2);
      }
      const securityEvents = scope.audit.mock.calls
        .map((call) => call[0])
        .filter((event) => event.action === 'wago.commissioning.security_apply');
      expect(securityEvents.map((event) => event.outcome)).toEqual(['attempted', 'succeeded']);
      expect(securityEvents[0].operationId).toBe(securityEvents[1].operationId);
    },
    15_000,
  );
}
