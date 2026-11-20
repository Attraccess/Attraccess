import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AuthenticationType,
  type CredentialRecord,
  type NewCredential,
  type SsoCredentialRecord,
  type SSOProviderType,
} from '@attraccess/application-models';
import { AuthenticationDetail } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import type { TransactionContext } from '../../transaction-context';
import { TransactionContextResolver } from '../transaction-context';
import type { CredentialStore } from '../../../users-and-auth/auth/credentials/credential-store.port';
import { appendPasswordHistory } from './password-history';

/** Advisory lock namespace (first key of the two-key form) for changes of a user's local password. */
const LOCAL_PASSWORD_LOCK = 584_401;

function toCredentialRecord(detail: AuthenticationDetail): CredentialRecord {
  return { id: detail.id, userId: detail.userId, type: detail.type };
}

function toSsoCredentialRecord(detail: AuthenticationDetail): SsoCredentialRecord {
  return {
    ...toCredentialRecord(detail),
    providerType: detail.providerType ?? null,
    providerId: detail.providerId ?? null,
    ssoSubject: detail.ssoSubject ?? null,
  };
}

@Injectable()
export class TypeOrmCredentialStore implements CredentialStore {
  constructor(
    @InjectRepository(AuthenticationDetail) private readonly details: Repository<AuthenticationDetail>,
    private readonly transactions: TransactionContextResolver,
  ) {}

  async findUserIdBySso(providerType: SSOProviderType, providerId: number, subject: string): Promise<number | null> {
    const detail = await this.details.findOne({
      where: { type: AuthenticationType.SSO, providerType, providerId, ssoSubject: subject },
    });
    return detail?.userId ?? null;
  }

  async findSso(userId: number): Promise<SsoCredentialRecord | null> {
    const detail = await this.details.findOne({ where: { userId, type: AuthenticationType.SSO } });
    return detail ? toSsoCredentialRecord(detail) : null;
  }

  async updateSsoSubject(credentialId: number, subject: string): Promise<void> {
    await this.details.update(credentialId, { ssoSubject: subject });
  }

  async findLocalPasswordHash(userId: number): Promise<string | null> {
    const detail = await this.details.findOne({ where: { userId, type: AuthenticationType.LOCAL_PASSWORD } });
    return detail ? (detail.password ?? '') : null;
  }

  async add(userId: number, credential: NewCredential, context?: TransactionContext): Promise<CredentialRecord> {
    const detail = new AuthenticationDetail();
    detail.userId = userId;
    detail.type = credential.type;
    if (credential.type === AuthenticationType.LOCAL_PASSWORD) {
      detail.password = credential.passwordHash;
    } else {
      detail.providerType = credential.providerType;
      detail.providerId = credential.providerId;
      detail.ssoSubject = credential.subject;
    }
    return toCredentialRecord(await this.transactions.manager(context).save(detail));
  }

  replaceLocalPassword(
    userId: number,
    passwordHash: string,
    options: { rememberPrevious: number },
    context?: TransactionContext,
  ): Promise<void> {
    return this.transactions.run(context, async (manager) => {
      const details = manager.getRepository(AuthenticationDetail);
      // Two changes of one user's password queue here, so the second archives the hash the first one stored and a
      // first password cannot be created twice.
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [LOCAL_PASSWORD_LOCK, userId]);
      const current = await details.findOne({ where: { userId, type: AuthenticationType.LOCAL_PASSWORD } });
      if (!current) {
        const created = new AuthenticationDetail();
        created.userId = userId;
        created.type = AuthenticationType.LOCAL_PASSWORD;
        created.password = passwordHash;
        await details.save(created);
        return;
      }
      if (current.password) await appendPasswordHistory(manager, userId, current.password, options.rememberPrevious);
      current.password = passwordHash;
      await details.save(current);
    });
  }

  async removeLocalPassword(userId: number): Promise<void> {
    await this.details.delete({ userId, type: AuthenticationType.LOCAL_PASSWORD });
  }

  async remove(credentialId: number): Promise<void> {
    await this.details.delete({ id: credentialId });
  }
}
