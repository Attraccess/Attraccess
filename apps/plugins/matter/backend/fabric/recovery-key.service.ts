import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MatterRecoveryKey } from '../backup/entities';
import {
  InvalidRecoveryKeyError,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  recoveryKeyId,
} from '../backup/recovery-key';
import { DeviceAuditService } from '../devices/audit.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
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

  private get repo() {
    return this.context.getRepository(MatterRecoveryKey);
  }

  current(): Promise<MatterRecoveryKey | null> {
    return this.repo.createQueryBuilder('k').where('k.retiredAt IS NULL').getOne();
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
  async generate(principal: PluginAuditPrincipal | null): Promise<RecoveryKeyReveal> {
    if (await this.current()) throw conflict('recovery_key_exists', 'A recovery key already exists.');
    const { row, reveal } = await this.create();
    await this.audit.record(
      'matter.recovery_key_generated',
      principal,
      { type: 'matter.recovery_key', ref: row.id },
      {
        keyId: row.keyId,
      },
    );
    return reveal;
  }

  async acknowledge(keyId: string, principal: PluginAuditPrincipal | null): Promise<void> {
    const row = await this.current();
    if (!row || row.keyId !== keyId) throw conflict('recovery_key_mismatch', 'That is not the current recovery key.');
    if (row.acknowledgedAt) return;
    row.acknowledgedAt = new Date().toISOString();
    await this.repo.save(row);
    await this.audit.record(
      'matter.recovery_key_acknowledged',
      principal,
      { type: 'matter.recovery_key', ref: row.id },
      {
        keyId: row.keyId,
      },
    );
  }

  /** Retires the current key and creates a new one. The old key stays (encrypted) so older backups can be read. */
  async rotate(principal: PluginAuditPrincipal | null): Promise<RecoveryKeyReveal> {
    const previous = await this.current();
    if (!previous) throw conflict('no_recovery_key', 'There is no recovery key to rotate.');
    const { row, reveal } = await this.context.getRepository(MatterRecoveryKey).manager.transaction(async (manager) => {
      await manager.update(MatterRecoveryKey, { id: previous.id }, { retiredAt: new Date().toISOString() });
      return this.create(manager);
    });
    await this.audit.record(
      'matter.recovery_key_rotated',
      principal,
      { type: 'matter.recovery_key', ref: row.id },
      {
        keyId: row.keyId,
        previousKeyId: previous.keyId,
      },
    );
    return reveal;
  }

  /** The current key's bytes, or null when there is none. Throws when it cannot be decrypted. */
  async currentKey(): Promise<{ keyId: string; key: Buffer } | null> {
    const row = await this.current();
    return row ? this.open(row) : null;
  }

  /** The key (current or retired) with this ID, if the installation has it. */
  async keyById(keyId: string): Promise<{ keyId: string; key: Buffer } | null> {
    const row = await this.repo.findOneBy({ keyId });
    return row ? this.open(row) : null;
  }

  /** Parses an administrator-supplied key. */
  parse(text: string): Buffer {
    return parseRecoveryKey(text);
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

  private async create(manager = this.repo.manager): Promise<{ row: MatterRecoveryKey; reveal: RecoveryKeyReveal }> {
    const key = generateRecoveryKey();
    const now = new Date().toISOString();
    const row = await manager.getRepository(MatterRecoveryKey).save({
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
