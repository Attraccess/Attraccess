import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MatterRecoveryKey } from '../backup/entities';
import { InvalidRecoveryKeyError, formatRecoveryKey, generateRecoveryKey, recoveryKeyId } from '../backup/recovery-key';
import { DeviceAuditService, type AuditBy } from '../devices/audit.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { matterStorage, type MatterTables } from '../plugin-storage/access';
import { conflict } from './errors';

/** Shown to the administrator exactly once, when the key is generated. */
export type RecoveryKeyReveal = { keyId: string; key: string; createdAt: string };
export type RecoveryKeyView = {
  present: boolean;
  keyId: string | null;
  createdAt: string | null;
  acknowledged: boolean;
};

export class RecoveryKeyUnreadableError extends Error {
  constructor() {
    super('The stored recovery key cannot be decrypted by this installation.');
    this.name = 'RecoveryKeyUnreadableError';
  }
}

/**
 * Owns the recovery keys. A key is stored only encrypted with the host's plugin secrets, is returned to a caller
 * once, at generation, and never appears in a log, an audit entry or a backup.
 */
@Injectable()
export class RecoveryKeyService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
  ) {}

  private get storage() {
    return matterStorage(this.context);
  }

  current(tables: MatterTables = this.storage.tables): Promise<MatterRecoveryKey | null> {
    return tables.recoveryKeys.findOne({ where: { retiredAt: null } });
  }

  async view(): Promise<RecoveryKeyView> {
    const row = await this.current();
    return {
      present: row !== null,
      keyId: row?.keyId ?? null,
      createdAt: row?.createdAt ?? null,
      acknowledged: row?.acknowledgedAt != null,
    };
  }

  /** Creates the first key. 409 when one exists: use `rotate`. */
  async generate(by: AuditBy): Promise<RecoveryKeyReveal> {
    // The check and the insert are one transaction: at most one current key exists, also for concurrent callers.
    const { row, reveal } = await this.storage.transaction(async (tables) => {
      if (await this.current(tables)) throw conflict('recovery_key_exists', 'A recovery key already exists.');
      return this.create(tables);
    });
    await this.audit.record(
      'matter.recovery_key_generated',
      by,
      { type: 'matter.recovery_key', ref: row.id },
      {
        keyId: row.keyId,
      },
    );
    return reveal;
  }

  async acknowledge(keyId: string, by: AuditBy): Promise<void> {
    const row = await this.current();
    if (!row || row.keyId !== keyId) throw conflict('recovery_key_mismatch', 'That is not the current recovery key.');
    if (row.acknowledgedAt) return;
    // Compare-and-set: the first acknowledgement wins, a repeated one changes nothing.
    await this.storage.tables.recoveryKeys.update(
      { id: row.id, acknowledgedAt: null },
      { acknowledgedAt: new Date().toISOString() },
    );
    await this.audit.record(
      'matter.recovery_key_acknowledged',
      by,
      { type: 'matter.recovery_key', ref: row.id },
      {
        keyId: row.keyId,
      },
    );
  }

  /** Retires the current key and creates a new one. The old key stays (encrypted) so older backups can be read. */
  async rotate(by: AuditBy): Promise<RecoveryKeyReveal> {
    const { previous, row, reveal } = await this.storage.transaction(async (tables) => {
      const previous = await this.current(tables);
      if (!previous) throw conflict('no_recovery_key', 'There is no recovery key to rotate.');
      // Compare-and-set on "still current": a concurrent rotation retired it first, so this one is refused.
      const retired = await tables.recoveryKeys.update(
        { id: previous.id, retiredAt: null },
        { retiredAt: new Date().toISOString() },
      );
      if (retired === 0) throw conflict('no_recovery_key', 'There is no recovery key to rotate.');
      return { previous, ...(await this.create(tables)) };
    });
    await this.audit.record(
      'matter.recovery_key_rotated',
      by,
      { type: 'matter.recovery_key', ref: row.id },
      {
        keyId: row.keyId,
        previousKeyId: previous.keyId,
      },
    );
    return reveal;
  }

  /**
   * Keeps a key the administrator already holds as the current one: the key a disaster-recovery restore was made with,
   * on an installation that has none. It is off-host with them already, so it counts as acknowledged, and it is never
   * returned. Does nothing when a current key exists or the key is not the one with `keyId`.
   */
  async adopt(key: Buffer, keyId: string, by: AuditBy): Promise<boolean> {
    if (recoveryKeyId(key) !== keyId) return false;
    const now = new Date().toISOString();
    const row = await this.storage.transaction(async (tables) => {
      if (await this.current(tables)) return null;
      return tables.recoveryKeys.insert({
        id: randomUUID(),
        keyId,
        encryptedKey: this.context.secrets.encrypt(key.toString('base64')),
        createdAt: now,
        acknowledgedAt: now,
        retiredAt: null,
      });
    });
    if (!row) return false;
    await this.audit.record(
      'matter.recovery_key_generated',
      by,
      { type: 'matter.recovery_key', ref: row.id },
      { keyId, source: 'restore' },
    );
    return true;
  }

  /** The current key's bytes, or null when there is none. Throws when it cannot be decrypted. */
  async currentKey(): Promise<{ keyId: string; key: Buffer } | null> {
    const row = await this.current();
    return row ? this.open(row) : null;
  }

  /** The key (current or retired) with this ID, if the installation has it. */
  async keyById(keyId: string): Promise<{ keyId: string; key: Buffer } | null> {
    const row = await this.storage.tables.recoveryKeys.findOne({ where: { keyId } });
    return row ? this.open(row) : null;
  }

  private open(row: MatterRecoveryKey): { keyId: string; key: Buffer } {
    try {
      const key = Buffer.from(this.context.secrets.decrypt(row.encryptedKey), 'base64');
      if (recoveryKeyId(key) !== row.keyId) throw new InvalidRecoveryKeyError();
      return { keyId: row.keyId, key };
    } catch {
      throw new RecoveryKeyUnreadableError();
    }
  }

  private async create(tables: MatterTables): Promise<{ row: MatterRecoveryKey; reveal: RecoveryKeyReveal }> {
    const key = generateRecoveryKey();
    const now = new Date().toISOString();
    const row = await tables.recoveryKeys.insert({
      id: randomUUID(),
      keyId: recoveryKeyId(key),
      encryptedKey: this.context.secrets.encrypt(key.toString('base64')),
      createdAt: now,
      acknowledgedAt: null,
      retiredAt: null,
    });
    return { row, reveal: { keyId: row.keyId, key: formatRecoveryKey(key), createdAt: now } };
  }
}
