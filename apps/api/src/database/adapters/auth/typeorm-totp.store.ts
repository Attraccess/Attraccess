import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthenticationType, type TotpCredentialRecord } from '@attraccess/application-models';
import { AuthenticationDetail } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import type { TotpStore } from '../../../users-and-auth/auth/credentials/credential-store.port';

@Injectable()
export class TypeOrmTotpStore implements TotpStore {
  constructor(@InjectRepository(AuthenticationDetail) private readonly details: Repository<AuthenticationDetail>) {}

  async find(userId: number): Promise<TotpCredentialRecord | null> {
    const detail = await this.details.findOne({ where: { userId, type: AuthenticationType.TOTP } });
    if (!detail) return null;
    return {
      id: detail.id,
      userId: detail.userId,
      encryptedSecret: detail.totpSecret ?? null,
      enabledAt: detail.totpEnabledAt ?? null,
    };
  }

  async saveSetup(userId: number, encryptedSecret: string): Promise<void> {
    const existing = await this.details.findOne({ where: { userId, type: AuthenticationType.TOTP } });
    const detail = existing ?? new AuthenticationDetail();
    detail.userId = userId;
    detail.type = AuthenticationType.TOTP;
    detail.totpSecret = encryptedSecret;
    detail.totpEnabledAt = null;
    await this.details.save(detail);
  }

  async markEnabled(credentialId: number, enabledAt: Date): Promise<void> {
    await this.details.update(credentialId, { totpEnabledAt: enabledAt });
  }

  async remove(credentialId: number): Promise<void> {
    await this.details.delete(credentialId);
  }
}
