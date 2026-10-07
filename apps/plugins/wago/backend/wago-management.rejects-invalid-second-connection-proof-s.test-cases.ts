import type { ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope } from './wago-management.spec';
import { WagoManagementService } from './wago-management';
import { ManagementError } from './wago-management';

export function registerRejectsInvalidSecondConnectionProofS(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it.each(['nonce', 'pin', 'key', 'password', 'operation'] as const)(
    'rejects invalid second connection proof: %s',
    async (fault) => {
      const h = scope.harness(),
        review = await h.review();
      h.adapter.verifyKey.mockImplementation(async (_tx, _key, nonce) => ({
        nonce: fault === 'nonce' ? 'reused' : nonce,
        hostKeyFingerprint: fault === 'pin' ? 'changed' : scope.target.hostKeyFingerprint,
        keyFingerprint: fault === 'key' ? 'wrong-key' : h.store.records.get(7)!.keyFingerprint!,
        keyOnly: fault !== 'password',
        uid: scope.observation.uid!,
        managementOperationSucceeded: fault !== 'operation',
      }));
      const result = await h.apply(review.reviewToken!);
      expect(result.state).toBe('recovered');
      expect(h.calls).not.toContain('restrict');
      expect(h.calls).not.toContain('commit');
      expect(h.adapter.rollback).toHaveBeenCalledTimes(1);
    },
  );
}

export function registerRequiresExplicitInspectAndReviewAndSerializesTheCompleteVerifyBeforeDisableTransition(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('requires explicit inspect and review, and serializes the complete verify-before-disable transition', async () => {
    const h = scope.harness();
    await expect(h.service.review(7, { mode: 'baseline', exceptions: [] })).rejects.toMatchObject({
      code: 'inspect_required',
    });
    const review = await h.review();
    expect(h.calls).toEqual([]);
    const result = await h.apply(review.reviewToken!);
    expect(h.calls).toEqual(['prepare', 'arm', 'install', 'verify', 'restrict', 'verify', 'baseline', 'commit']);
    expect(result).toMatchObject({ state: 'hardened', hardened: true, reviewToken: null });
    const encrypted = h.store.records.get(7)!.encryptedPrivateKey!;
    expect(h.secrets.decrypt(encrypted)).toContain('OPENSSH PRIVATE KEY');
    const publicJson = JSON.stringify(result),
      persistedJson = JSON.stringify(h.store.history);
    for (const text of [publicJson, persistedJson]) {
      expect(text).not.toContain(scope.credential.password);
      expect(text).not.toContain('OPENSSH PRIVATE KEY');
    }
    expect(publicJson).not.toContain(encrypted);
    expect(publicJson.length).toBeLessThan(2048);
    expect(h.store.history.find((entry) => entry.state === 'preparing')?.encryptedPrivateKey).toBeTruthy();
  });
}

export function registerRestartDuringHardeningNeverRetriesRestrictionsAndWaitsForTheCrashedWriterLease(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('restart during hardening never retries restrictions and waits for the crashed writer lease', async () => {
    const h = scope.harness(),
      review = await h.review();
    await h.apply(review.reviewToken!);
    h.store.records.set(7, structuredClone(h.store.history.find((entry) => entry.state === 'restricting_access')!));
    h.store.leases.set(7, { owner: 'crashed-process', until: h.now() + 300000 });
    h.calls.length = 0;
    const restarted = new WagoManagementService(h.store, h.secrets, h.adapter, h.now);
    expect(await restarted.status(7)).toMatchObject({ recoveryRequired: true, hardened: false });
    expect(h.calls).toEqual([]);
    await expect(restarted.recover(7, { confirm: true, temporarySsh: scope.credential })).rejects.toMatchObject({
      code: 'busy',
    });
    h.advance(300001);
    expect(await restarted.recover(7, { confirm: true, temporarySsh: scope.credential })).toMatchObject({
      state: 'recovered',
    });
    expect(h.calls).toEqual(['rollback']);
  });
}

export function registerRetainsEncryptedKeyAndJournalOnRollbackFailureThenExplicitlyRecoversWithFreshCredential(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('retains encrypted key and journal on rollback failure, then explicitly recovers with fresh credentials', async () => {
    const h = scope.harness(),
      review = await h.review();
    h.adapter.restrictAccess.mockRejectedValue(new Error('failed'));
    h.adapter.rollback.mockRejectedValueOnce(new Error(scope.credential.password));
    const result = await h.apply(review.reviewToken!);
    expect(result).toMatchObject({ state: 'recovery_required', failure: 'rollback_failed', recoveryRequired: true });
    expect(h.store.records.get(7)?.transaction).toBeTruthy();
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeTruthy();
    await expect(
      h.service.recover(7, { confirm: true, temporarySsh: { username: 'operator', password: '' } }),
    ).rejects.toBeInstanceOf(ManagementError);
    const recovered = await h.service.recover(7, {
      confirm: true,
      temporarySsh: { ...scope.credential, password: 'fresh-request' },
    });
    expect(recovered).toMatchObject({ state: 'recovered', recoveryRequired: false, keyFingerprint: null });
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeNull();
  });
}

export function registerRetainsRecoveryIdentityWhenTheFinalRecoveryDatabaseWriteFails(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('retains recovery identity when the final recovery database write fails', async () => {
    const h = scope.harness(),
      review = await h.review();
    h.adapter.verifyKey.mockRejectedValue(new Error('no connection'));
    const save = h.store.save.bind(h.store);
    jest.spyOn(h.store, 'save').mockImplementation(async (id, owner, record, now) => {
      if (record.state === 'recovered') throw new Error('database unavailable');
      await save(id, owner, record, now);
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovery_required' });
    expect(h.store.records.get(7)?.transaction).toBeTruthy();
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeTruthy();
  });
}

export function registerSerializesPerControllerAcrossServiceInstancesWithoutBlockingOtherControllers(
  scope: ManagementTransitionOrchestrationNoDeviceOrBrokerConnectionsTestScope,
): void {
  it('serializes per controller across service instances without blocking other controllers', async () => {
    const h = scope.harness(),
      review = await h.review();
    let resume!: () => void;
    h.adapter.prepare.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    const first = h.apply(review.reviewToken!);
    while (!resume) await new Promise((resolve) => setImmediate(resolve));
    const second = new WagoManagementService(h.store, h.secrets, h.adapter, h.now);
    await expect(
      second.apply(7, { reviewToken: review.reviewToken!, confirm: true, temporarySsh: scope.credential }),
    ).rejects.toMatchObject({ code: 'busy' });
    expect(await second.inspect({ ...scope.target, controllerId: 8 }, scope.credential)).toMatchObject({
      controllerId: 8,
    });
    resume();
    await first;
  });
}
