import { randomBytes } from 'node:crypto';
import type { PluginSecretsContext } from '@attraccess/plugins-backend-sdk';
import { assertManagementKey, generateManagementKey, restoreManagementKey } from './wago-management-key';
import type {
  ManagementAdapter,
  ManagementException,
  ManagementInspection,
  ManagementKey,
  ManagementMode,
  ManagementPublicStatus,
  ManagementRecord,
  ManagementState,
  ManagementStore,
  ManagementTarget,
  SessionCredential,
} from './wago-management.types';

const transitionStates: ManagementState[] = [
  'preparing',
  'installing_key',
  'verifying_key',
  'restricting_access',
  'verifying_baseline',
  'committing',
  'recovering',
  'recovery_required',
];
const exceptionNames: ManagementException[] = ['wbm_exposed', 'other_services_exposed', 'unqualified_privileges'];
const identifier = () => randomBytes(16).toString('hex');
const LEASE_MS = 300000;
type ManagementOwner = { id: string; assertOwned: () => Promise<void> };

export class ManagementError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'credentials_required'
      | 'busy'
      | 'inspect_required'
      | 'review_required'
      | 'qualification_required'
      | 'UNSUPPORTED'
      | 'recovery_required'
      | 'operation_failed',
  ) {
    super(code);
  }
}

/** Coordinator API (no routes registered here):
 * inspect(serverResolvedTarget, freshCredential) -> review(id, {mode, exceptions})
 * -> apply(id, {reviewToken, confirm: true, temporarySsh}) -> status(id).
 * recover(id, {confirm: true, temporarySsh}) resumes ONLY rollback with fresh credentials.
 * Controller/API coordinator must enforce settings.manage, controller ownership, trusted host pin,
 * and avoid overlapping runtime installation with this transition. No constructor/startup SSH.
 * Repository and device transaction locks serialize management writers across process restarts.
 */
export class WagoManagementService {
  constructor(
    private readonly store: ManagementStore,
    private readonly secrets: PluginSecretsContext,
    private readonly adapter: ManagementAdapter,
    private readonly now = Date.now,
    private readonly createKey: () => ManagementKey = generateManagementKey,
  ) {}

  async status(controllerId: number): Promise<ManagementPublicStatus | null> {
    validId(controllerId);
    try {
      const record = await this.store.load(controllerId);
      return record ? publicStatus(record) : null;
    } catch {
      throw new ManagementError('operation_failed');
    }
  }

  async inspect(
    target: ManagementTarget,
    credential: SessionCredential,
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    validateTarget(target);
    validateCredential(credential);
    return this.locked(
      target.controllerId,
      async (owner) => {
        const previous = await this.store.load(target.controllerId);
        if (previous?.transaction) throw new ManagementError('recovery_required');
        const inspection = cleanInspection(await this.adapter.inspect(target, credential));
        const record: ManagementRecord = {
          target: {
            controllerId: target.controllerId,
            host: target.host,
            hostKeyFingerprint: target.hostKeyFingerprint,
          },
          state: 'inspected',
          inspection,
          mode: null,
          exceptions: [],
          support: this.adapter.qualify(inspection, 'baseline').support,
          reviewToken: null,
          reviewedAt: null,
          transaction: null,
          keyFingerprint: null,
          encryptedPrivateKey: null,
          failure: null,
        };
        await this.save(record, owner);
        return publicStatus(record);
      },
      assertOwned,
    );
  }

  async review(
    controllerId: number,
    input: { mode: ManagementMode; exceptions: ManagementException[] },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    exactKeys(input, ['mode', 'exceptions']);
    if (
      !['key_only', 'baseline'].includes(input.mode) ||
      !Array.isArray(input.exceptions) ||
      input.exceptions.length > 3 ||
      input.exceptions.some((value) => !exceptionNames.includes(value))
    )
      throw new ManagementError('invalid_request');
    return this.locked(
      controllerId,
      async (owner) => {
        const record = await this.required(controllerId);
        if (record.transaction) throw new ManagementError('recovery_required');
        if (!record.inspection || !['inspected', 'reviewed'].includes(record.state))
          throw new ManagementError('inspect_required');
        record.mode = input.mode;
        record.exceptions = [...new Set(input.exceptions)].sort();
        record.support = this.adapter.qualify(record.inspection, input.mode).support;
        // These acknowledgements disclose residuals; they NEVER confer qualification.
        if (
          input.mode === 'key_only' &&
          (!record.exceptions.includes('unqualified_privileges') ||
            (record.inspection.wbm !== 'not_observed' && !record.exceptions.includes('wbm_exposed')) ||
            (record.inspection.otherManagement !== 'not_observed' &&
              !record.exceptions.includes('other_services_exposed')))
        )
          throw new ManagementError('invalid_request');
        record.reviewToken = identifier();
        record.reviewedAt = this.now();
        record.state = 'reviewed';
        await this.save(record, owner);
        return publicStatus(record);
      },
      assertOwned,
    );
  }

  async apply(
    controllerId: number,
    input: { reviewToken: string; confirm: true; temporarySsh: SessionCredential },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    exactKeys(input, ['reviewToken', 'confirm', 'temporarySsh']);
    if (input.confirm !== true || typeof input.reviewToken !== 'string' || !/^[a-f0-9]{32}$/.test(input.reviewToken))
      throw new ManagementError('invalid_request');
    validateCredential(input.temporarySsh);
    return this.locked(
      controllerId,
      async (owner) => {
        const record = await this.required(controllerId);
        if (record.transaction) throw new ManagementError('recovery_required');
        if (
          record.state !== 'reviewed' ||
          record.reviewToken !== input.reviewToken ||
          record.reviewedAt === null ||
          this.now() - record.reviewedAt > LEASE_MS ||
          this.now() < record.reviewedAt ||
          !record.mode ||
          !record.inspection
        )
          throw new ManagementError('review_required');
        const qualification = this.adapter.qualify(record.inspection, record.mode);
        if (qualification.support !== 'supported') throw new ManagementError(qualification.support);
        if (record.mode === 'baseline' && (!qualification.minimumPrivileges || !qualification.rebootSafeWatchdog))
          throw new ManagementError('qualification_required');
        const fresh = cleanInspection(await this.adapter.inspect(record.target, input.temporarySsh));
        if (JSON.stringify(fresh) !== JSON.stringify(record.inspection)) throw new ManagementError('inspect_required');
        let key: ManagementKey | undefined;
        try {
          key = this.createKey();
          assertManagementKey(key);
          record.encryptedPrivateKey = this.secrets.encrypt(key.privateKey);
          if (!record.encryptedPrivateKey || record.encryptedPrivateKey === key.privateKey) throw new Error();
          // Verify the encrypted envelope before any remote mutation; storage holds ciphertext only.
          if (this.secrets.decrypt(record.encryptedPrivateKey) !== key.privateKey) throw new Error();
          record.keyFingerprint = key.fingerprint;
          record.transaction = {
            id: identifier(),
            target: record.target,
            username: input.temporarySsh.username,
            deadline: this.now() + 150000,
          };
          record.reviewToken = null;
          record.state = 'preparing';
          record.failure = null;
          await this.save(record, owner); // durable intent and encrypted key BEFORE preparing remote state
          const tx = record.transaction;
          await this.adapter.prepare(tx, input.temporarySsh);
          const watchdog = await this.adapter.armWatchdog(tx, input.temporarySsh);
          if (!watchdog.armed || (record.mode === 'baseline' && !watchdog.rebootSafe)) throw new Error();
          await this.step(record, owner, 'installing_key');
          await this.adapter.installKey(tx, input.temporarySsh, key.publicKey);
          await this.step(record, owner, 'verifying_key');
          await this.verify(record, key.privateKey);
          if (record.mode === 'baseline') {
            await this.step(record, owner, 'restricting_access');
            await this.adapter.restrictAccess(tx, input.temporarySsh, key.privateKey);
            await this.step(record, owner, 'verifying_baseline');
            // Verify a THIRD fresh key connection after changing policy/reloading the service.
            await this.verify(record, key.privateKey);
            const result = await this.adapter.verifyBaseline(tx, key.privateKey);
            if (
              !result.passwordDisabled ||
              !result.defaultAccessDisabled ||
              !result.minimumPrivileges ||
              (!result.wbmSecure && !record.exceptions.includes('wbm_exposed')) ||
              (!result.otherManagementSecure && !record.exceptions.includes('other_services_exposed'))
            )
              throw new Error();
          }
          await this.step(record, owner, 'committing');
          await this.adapter.commit(tx, input.temporarySsh, key.privateKey);
          record.state = record.mode === 'baseline' && record.exceptions.length === 0 ? 'hardened' : 'key_enrolled';
          if (record.state !== 'hardened') record.support = 'qualification_required';
          await this.save(record, owner);
          return publicStatus(record);
        } catch {
          // No raw transport/crypto/database errors, stdout or credentials are persisted or returned.
          if (!record.transaction) throw new ManagementError('operation_failed');
          return this.rollback(record, owner, input.temporarySsh, 'transition_failed');
        } finally {
          if (key) key.privateKey = '';
        }
      },
      assertOwned,
    );
  }

  async recover(
    controllerId: number,
    input: { confirm: true; temporarySsh: SessionCredential },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    exactKeys(input, ['confirm', 'temporarySsh']);
    if (input.confirm !== true) throw new ManagementError('invalid_request');
    validateCredential(input.temporarySsh);
    return this.locked(
      controllerId,
      async (owner) => {
        const record = await this.required(controllerId);
        if (record.state === 'recovered') return publicStatus(record);
        if (!record.transaction) throw new ManagementError('invalid_request');
        if (input.temporarySsh.username !== record.transaction.username)
          throw new ManagementError('credentials_required');
        return this.rollback(record, owner, input.temporarySsh, null);
      },
      assertOwned,
    );
  }

  private async verify(record: ManagementRecord, privateKey: string): Promise<void> {
    const nonce = identifier(),
      tx = record.transaction!;
    const proof = await this.adapter.verifyKey(tx, privateKey, nonce);
    if (
      proof.nonce !== nonce ||
      !proof.keyOnly ||
      proof.hostKeyFingerprint !== tx.target.hostKeyFingerprint ||
      proof.keyFingerprint !== record.keyFingerprint ||
      !Number.isSafeInteger(proof.uid) ||
      proof.uid <= 0 ||
      proof.uid !== record.inspection!.uid ||
      !proof.managementOperationSucceeded
    )
      throw new Error('verification_failed');
  }

  private async rollback(
    record: ManagementRecord,
    owner: ManagementOwner,
    credential: SessionCredential,
    failure: ManagementRecord['failure'],
  ): Promise<ManagementPublicStatus> {
    record.state = 'recovering';
    record.failure = failure;
    let retainedKey: string | undefined;
    try {
      await this.save(record, owner);
      if (record.encryptedPrivateKey) {
        // A committed baseline may no longer accept passwords. The trusted adapter can restore
        // access with the retained generated key after restart; it never leaves this server seam.
        // If the envelope is unavailable, fresh session credentials may still permit recovery.
        try {
          retainedKey = restoreManagementKey(
            this.secrets.decrypt(record.encryptedPrivateKey),
            record.keyFingerprint ?? '',
          ).privateKey;
        } catch {
          retainedKey = undefined;
        }
      }
      await this.adapter.rollback(record.transaction!, credential, retainedKey);
      const recovered: ManagementRecord = {
        ...record,
        state: 'recovered',
        transaction: null,
        encryptedPrivateKey: null,
        keyFingerprint: null,
        reviewToken: null,
        support: 'qualification_required',
      };
      await this.save(recovered, owner);
      return publicStatus(recovered);
    } catch {
      record.state = 'recovery_required';
      record.failure = 'rollback_failed';
      await this.save(record, owner);
    } finally {
      retainedKey = undefined;
    }
    return publicStatus(record);
  }
  private async step(record: ManagementRecord, owner: ManagementOwner, state: ManagementState): Promise<void> {
    if (this.now() + 15000 >= record.transaction!.deadline) throw new Error('deadline');
    record.state = state;
    await this.save(record, owner);
  }
  private async save(record: ManagementRecord, owner: ManagementOwner) {
    await owner.assertOwned();
    await this.store.save(record.target.controllerId, owner.id, record, this.now());
    await owner.assertOwned();
  }
  private async required(controllerId: number): Promise<ManagementRecord> {
    const record = await this.store.load(controllerId);
    if (!record) throw new ManagementError('inspect_required');
    return record;
  }
  private async locked<T>(
    controllerId: number,
    action: (owner: ManagementOwner) => Promise<T>,
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<T> {
    validId(controllerId);
    const owner = identifier();
    let acquired = false;
    try {
      await assertOwned();
      acquired = await this.store.acquire(controllerId, owner, this.now(), this.now() + LEASE_MS);
      if (!acquired) throw new ManagementError('busy');
      await assertOwned();
      return await action({ id: owner, assertOwned });
    } catch (error) {
      if (error instanceof ManagementError) throw error;
      throw new ManagementError('operation_failed');
    } finally {
      if (acquired) await this.store.release(controllerId, owner).catch(() => undefined);
    }
  }
}

function validId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ManagementError('invalid_request');
}
function exactKeys(input: object, keys: string[]): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new ManagementError('invalid_request');
}
function validateCredential(credential: SessionCredential): void {
  if (
    !credential ||
    typeof credential.username !== 'string' ||
    !/^[a-z_][a-z0-9_-]{0,31}$/.test(credential.username) ||
    typeof credential.password !== 'string' ||
    credential.password.length < 1 ||
    credential.password.length > 4096 ||
    /[\0\r\n]/.test(credential.password)
  )
    throw new ManagementError('credentials_required');
  exactKeys(credential, ['username', 'password']);
}
function validateTarget(target: ManagementTarget): void {
  validId(target.controllerId);
  const octets = typeof target.host === 'string' && target.host.split('.');
  if (
    !octets ||
    octets.length !== 4 ||
    octets.some((value) => !/^(0|[1-9]\d{0,2})$/.test(value) || Number(value) > 255)
  )
    throw new ManagementError('invalid_request');
  const [a, b] = octets.map(Number);
  if (
    !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) ||
    !/^SHA256:[A-Za-z0-9+/]{43}$/.test(target.hostKeyFingerprint)
  )
    throw new ManagementError('invalid_request');
}
function pick<T extends string>(value: T, options: readonly T[]): T {
  if (!options.includes(value)) throw new ManagementError('operation_failed');
  return value;
}
/** Structural allowlist: discard even unexpected extra adapter properties rather than spreading them. */
function cleanInspection(value: ManagementInspection): ManagementInspection {
  if (value.uid !== null && (!Number.isSafeInteger(value.uid) || value.uid < 0 || value.uid > 4294967294))
    throw new ManagementError('operation_failed');
  return {
    model: pick(value.model, ['cc100', 'unknown']),
    firmware: pick(value.firmware, ['31', 'unsupported', 'unknown']),
    ssh: pick(value.ssh, ['openssh', 'dropbear', 'mixed', 'unknown']),
    serviceControl: pick(value.serviceControl, ['systemd', 'sysv', 'unknown']),
    uid: value.uid,
    wbm: pick(value.wbm, ['listening', 'not_observed', 'unknown']),
    otherManagement: pick(value.otherManagement, ['listening', 'not_observed', 'unknown']),
    networkScope: 'local_socket_observation',
    passwordAccess: 'unknown',
    defaultAccess: 'unknown',
  };
}
function publicStatus(record: ManagementRecord): ManagementPublicStatus {
  return {
    controllerId: record.target.controllerId,
    state: pick(record.state, [...transitionStates, 'inspected', 'reviewed', 'key_enrolled', 'hardened', 'recovered']),
    support: pick(record.support, ['supported', 'UNSUPPORTED', 'qualification_required']),
    inspection: record.inspection ? cleanInspection(record.inspection) : null,
    mode: record.mode === null ? null : pick(record.mode, ['baseline', 'key_only']),
    exceptions: record.exceptions.filter((value) => exceptionNames.includes(value)).slice(0, 3),
    keyFingerprint:
      record.keyFingerprint && /^SHA256:[A-Za-z0-9+/]{43}$/.test(record.keyFingerprint) ? record.keyFingerprint : null,
    reviewToken: record.reviewToken && /^[a-f0-9]{32}$/.test(record.reviewToken) ? record.reviewToken : null,
    failure:
      record.failure === null
        ? null
        : pick(record.failure, ['inspection_failed', 'transition_failed', 'rollback_failed']),
    recoveryRequired: transitionStates.includes(record.state),
    hardened: record.state === 'hardened' && record.support === 'supported' && record.exceptions.length === 0,
  };
}
