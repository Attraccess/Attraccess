import type { ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope } from './wago-management.spec';
import { WagoManagementProvider } from './wago-management-provider';
import type { ManagementRecord } from './wago-management.types';
import { WagoManagementService } from './wago-management';
import { generateManagementKey } from './wago-management-key';

export function registerAnExpiredTransitionCannotDisableAccessAndAThirdConnectionFailureCannotCommit(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('an expired transition cannot disable access and a third connection failure cannot commit', async () => {
    const h = scope.harness(),
      review = await h.review();
    const verify = h.adapter.verifyKey.getMockImplementation()!;
    h.adapter.verifyKey.mockImplementation(async (...args) => {
      const proof = await verify(...args);
      h.advance(150000);
      return proof;
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(h.calls).not.toContain('restrict');

    const other = scope.harness(),
      otherReview = await other.review();
    const otherVerify = other.adapter.verifyKey.getMockImplementation()!;
    other.adapter.verifyKey
      .mockImplementationOnce(otherVerify)
      .mockRejectedValueOnce(new Error('policy locked out key'));
    expect(await other.apply(otherReview.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(other.calls).toContain('restrict');
    expect(other.calls).not.toContain('commit');
  });
}

export function registerBlocksMissingFirmwareEvidenceS(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it.each(['unsupported', 'unknown'] as const)('blocks missing firmware evidence: %s', async (firmware) => {
    const h = scope.harness();
    const provider = new WagoManagementProvider({ execute: jest.fn(), verifyNewKeyConnection: jest.fn() });
    h.adapter.inspect.mockResolvedValue({ ...scope.observation, firmware });
    h.adapter.qualify.mockImplementation((...args) => provider.qualify(...args));
    const review = await h.review();
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
    expect(h.calls).toEqual([]);
  });
}

export function registerBoundsReviewsRejectsArbitraryScriptsAndRequiresReinspectionAfterDrift(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('bounds reviews, rejects arbitrary scripts, and requires reinspection after drift', async () => {
    const h = scope.harness();
    const review = await h.review();
    await expect(
      h.service.review(7, { mode: 'baseline', exceptions: [], script: 'rm -rf /' } as never),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    h.adapter.inspect.mockResolvedValue({ ...scope.observation, ssh: 'dropbear' });
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({ code: 'inspect_required' });
    h.advance(300001);
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({ code: 'review_required' });
    expect(h.calls).toEqual([]);
  });
}

export function registerDoesNotLetAReviewedBaselineExposureExceptionImplyHardened(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('does not let a reviewed baseline exposure exception imply hardened', async () => {
    const h = scope.harness();
    await h.review();
    const review = await h.service.review(7, { mode: 'baseline', exceptions: ['wbm_exposed'] });
    h.adapter.verifyBaseline.mockResolvedValue({
      passwordDisabled: true,
      defaultAccessDisabled: true,
      minimumPrivileges: true,
      wbmSecure: false,
      otherManagementSecure: true,
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'key_enrolled', hardened: false });
  });
}

export function registerDoesNotPersistAReviewAfterOuterOwnershipIsLostDuringTheRead(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('does not persist a review after outer ownership is lost during the read', async () => {
    const h = scope.harness();
    await h.service.inspect(scope.target, scope.credential);
    const original = await h.store.load(7);
    let finish!: (record: ManagementRecord | null) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.spyOn(h.store, 'load').mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    let owned = true;
    const review = h.service.review(7, { mode: 'baseline', exceptions: [] }, async () => {
      if (!owned) throw new Error('outer_lease_lost');
    });
    await started;
    owned = false;
    finish(original);
    await expect(review).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.store.history).toHaveLength(1);
    expect(h.store.records.get(7)?.state).toBe('inspected');
    expect(h.store.records.get(7)?.reviewToken).toBeNull();
  });
}

export function registerDoesNotStartRollbackAfterOuterOwnershipIsLostDuringPersistence(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('does not start rollback after outer ownership is lost during persistence', async () => {
    const h = scope.harness();
    const reviewed = await h.review();
    const save = h.store.save.bind(h.store);
    let owned = true;
    jest.spyOn(h.store, 'save').mockImplementation(async (...args) => {
      await save(...args);
      owned = false;
    });
    await expect(
      h.service.apply(
        7,
        { reviewToken: reviewed.reviewToken!, confirm: true, temporarySsh: scope.credential },
        async () => {
          if (!owned) throw new Error('outer_lease_lost');
        },
      ),
    ).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.adapter.prepare).not.toHaveBeenCalled();
    expect(h.adapter.rollback).not.toHaveBeenCalled();
    expect(h.store.records.get(7)?.state).toBe('preparing');
  });
}

export function registerDoesNotTurnAnInstalledRootKeyOrUnqualifiedPrivilegesIntoHardened(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('does not turn an installed root key or unqualified privileges into hardened', async () => {
    const h = scope.harness();
    const review = await h.review();
    h.adapter.verifyKey.mockImplementation(async (_tx, _key, nonce) => ({
      nonce,
      keyOnly: true,
      hostKeyFingerprint: scope.target.hostKeyFingerprint,
      keyFingerprint: h.store.records.get(7)!.keyFingerprint!,
      uid: 0,
      managementOperationSucceeded: true,
    }));
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered', hardened: false });
    expect(h.calls).not.toContain('restrict');
  });
}

export function registerDropsUnexpectedInspectionPropertiesAndNeverForwardsAFullBaselineCommandThroughTheBuilt(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('drops unexpected inspection properties and never forwards a full baseline command through the built-in provider', async () => {
    const h = scope.harness();
    h.adapter.inspect.mockResolvedValue(
      Object.assign({}, scope.observation, { password: scope.credential.password, stdout: 'private output' }),
    );
    const result = await h.service.inspect(scope.target, scope.credential);
    expect(JSON.stringify(result)).not.toContain(scope.credential.password);
    expect(JSON.stringify(h.store.history)).not.toContain('private output');
    const ssh = { execute: jest.fn(), verifyNewKeyConnection: jest.fn() };
    const provider = new WagoManagementProvider(ssh);
    expect(provider.qualify(scope.observation, 'baseline')).toMatchObject({
      support: 'UNSUPPORTED',
      evidence: 'fw31-baseline-not-implemented',
    });
    expect(provider.qualify({ ...scope.observation, uid: 0 }, 'key_only')).toMatchObject({
      support: 'UNSUPPORTED',
      evidence: 'supported-ssh-nonroot-account-required',
    });
    await expect(provider.restrictAccess()).rejects.toThrow('fw31-baseline-not-implemented');
    await expect(provider.verifyBaseline()).rejects.toThrow('fw31-baseline-not-implemented');
    expect(ssh.execute).not.toHaveBeenCalled();
  });
}

export function registerExceptionsNeverBecomeHardenedAndAdditiveModeNeverDisablesAccess(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('exceptions never become hardened, and additive mode never disables access', async () => {
    const h = scope.harness();
    await h.review();
    const review = await h.service.review(7, { mode: 'key_only', exceptions: ['unqualified_privileges'] });
    const result = await h.apply(review.reviewToken!);
    expect(result).toMatchObject({ state: 'key_enrolled', hardened: false, support: 'qualification_required' });
    expect(h.calls).toEqual(['prepare', 'arm', 'install', 'verify', 'commit']);
  });
}

export function registerFailedSecondConnectionRollsBackWithoutLeakingTransportSecrets(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('failed second connection rolls back without leaking transport secrets', async () => {
    const h = scope.harness(),
      review = await h.review();
    h.adapter.verifyKey.mockRejectedValue(
      new Error(`stderr ${scope.credential.password} PRIVATE KEY ${'x'.repeat(100000)}`),
    );
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered', failure: 'transition_failed' });
    expect(h.calls).not.toContain('restrict');
    expect(JSON.stringify(h.store.history)).not.toContain(scope.credential.password);
  });
}

export function registerInvalidGeneratedKeyOrEncryptionFailureNeverReachesTheController(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('invalid generated key or encryption failure never reaches the controller', async () => {
    const h = scope.harness();
    const review = await h.review();
    const service = new WagoManagementService(h.store, h.secrets, h.adapter, h.now, () => ({
      ...generateManagementKey(),
      publicKey: 'ssh-ed25519 invalid',
    }));
    await expect(
      service.apply(7, { reviewToken: review.reviewToken!, confirm: true, temporarySsh: scope.credential }),
    ).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.calls).toEqual([]);
    h.secrets.encrypt.mockImplementation(() => {
      throw new Error(scope.credential.password);
    });
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.calls).toEqual([]);
  });
}

export function registerMakesTheRetainedGeneratedKeyAvailableOnlyToTheTrustedRecoveryAdapterAfterRestart(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('makes the retained generated key available only to the trusted recovery adapter after restart', async () => {
    const h = scope.harness(),
      review = await h.review();
    await h.apply(review.reviewToken!);
    const restarted = new WagoManagementService(h.store, h.secrets, h.adapter, h.now);
    const result = await restarted.recover(7, { confirm: true, temporarySsh: scope.credential });
    expect(result.state).toBe('recovered');
    expect(h.adapter.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ target: scope.target }),
      scope.credential,
      expect.stringContaining('-----BEGIN OPENSSH PRIVATE KEY-----'),
    );
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeNull();
  });
}

export function registerPostRestrictionVerificationFailureRollsBackBeforeDisarmingTheWatchdog(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('post-restriction verification failure rolls back before disarming the watchdog', async () => {
    const h = scope.harness(),
      review = await h.review();
    h.adapter.verifyBaseline.mockResolvedValue({
      passwordDisabled: false,
      defaultAccessDisabled: true,
      minimumPrivileges: true,
      wbmSecure: true,
      otherManagementSecure: true,
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(h.adapter.verifyBaseline).toHaveBeenCalledTimes(1);
    expect(h.calls.at(-1)).toBe('rollback');
    expect(h.calls).not.toContain('commit');
  });
}

export function registerRefusesRestrictionsWithoutAConfirmedRebootSafeWatchdog(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('refuses restrictions without a confirmed reboot-safe watchdog', async () => {
    const h = scope.harness(),
      review = await h.review();
    h.adapter.armWatchdog.mockResolvedValue({ armed: true, rebootSafe: false });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(h.calls).not.toContain('install');
    expect(h.calls).not.toContain('restrict');
  });
}
