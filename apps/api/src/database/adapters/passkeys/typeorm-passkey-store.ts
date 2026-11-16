import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Passkey, PasskeyChallenge, User } from '@attraccess/database-entities';
import type {
  AuthenticatedSessionUser,
  NewPasskey,
  PasskeyChallengeRecord,
  PasskeyRecord,
} from '@attraccess/application-models';
import type { PasskeyStore } from '../../../users-and-auth/auth/passkey/passkey.port';

function toRecord(passkey: Passkey): PasskeyRecord {
  return {
    id: passkey.id,
    userId: passkey.userId,
    credentialId: passkey.credentialId,
    publicKey: passkey.publicKey,
    counter: passkey.counter,
    transports: passkey.transports,
    name: passkey.name,
    backedUp: passkey.backedUp,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  };
}

/** SQLite hands raw `datetime` columns back as 'YYYY-MM-DD HH:MM:SS.mmm' in UTC. */
function parseStoredDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(`${value.replace(' ', 'T')}Z`);
}

@Injectable()
export class TypeOrmPasskeyStore implements PasskeyStore {
  constructor(
    @InjectRepository(Passkey) private readonly passkeys: Repository<Passkey>,
    @InjectRepository(PasskeyChallenge) private readonly challenges: Repository<PasskeyChallenge>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async listForUser(userId: number): Promise<PasskeyRecord[]> {
    return (await this.passkeys.find({ where: { userId }, order: { createdAt: 'DESC' } })).map(toRecord);
  }

  async findByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
    const passkey = await this.passkeys.findOneBy({ credentialId });
    return passkey ? toRecord(passkey) : null;
  }

  async register(passkey: NewPasskey): Promise<PasskeyRecord> {
    return toRecord(await this.passkeys.save(this.passkeys.create(passkey)));
  }

  async renameOwned(userId: number, passkeyId: number, name: string): Promise<PasskeyRecord | null> {
    const passkey = await this.passkeys.findOneBy({ id: passkeyId, userId });
    if (!passkey) return null;
    passkey.name = name;
    return toRecord(await this.passkeys.save(passkey));
  }

  async deleteOwned(userId: number, passkeyId: number): Promise<boolean> {
    const result = await this.passkeys.delete({ id: passkeyId, userId });
    return !!result.affected;
  }

  async recordUse(passkeyId: number, use: { counter: number; backedUp: boolean; usedAt: Date }): Promise<void> {
    await this.passkeys.update(passkeyId, {
      counter: use.counter,
      backedUp: use.backedUp,
      lastUsedAt: use.usedAt,
    });
  }

  findSignInUser(userId: number): Promise<AuthenticatedSessionUser | null> {
    return this.users.findOneBy({ id: userId });
  }

  async issueChallenge(challenge: PasskeyChallengeRecord): Promise<void> {
    // ponytail: opportunistic sweep instead of a cron; challenges live 5 minutes so the table stays tiny
    await this.challenges.delete({ expiresAt: LessThan(new Date()) });
    await this.challenges.insert({
      challenge: challenge.challenge,
      userId: challenge.userId,
      expiresAt: challenge.expiresAt,
    });
  }

  // One DELETE ... RETURNING statement: the database hands each stored challenge to exactly one caller.
  // Lowercase `delete` keeps TypeORM's SQLite runner on sqlite3.all, which returns the rows.
  async consumeChallenge(challenge: string): Promise<PasskeyChallengeRecord | null> {
    const rows = (await this.challenges.query(
      'delete FROM "passkey_challenge" WHERE "challenge" = ? RETURNING "challenge", "userId", "expiresAt"',
      [challenge],
    )) as { challenge: string; userId: number | null; expiresAt: string | Date }[];
    const row = rows[0];
    return row ? { challenge: row.challenge, userId: row.userId, expiresAt: parseStoredDate(row.expiresAt) } : null;
  }
}
