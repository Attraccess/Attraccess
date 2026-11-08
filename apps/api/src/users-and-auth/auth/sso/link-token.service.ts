import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SSOProviderType, Setting } from '@attraccess/database-entities';
import { EncryptionService } from '../../../encryption/encryption.service';
import { SESSION_STORE, SessionStore } from '../session-store/session-store';

/** Wrong passwords a single link token tolerates before it is dead. */
export const MAX_LINK_TOKEN_PASSWORD_ATTEMPTS = 3;

const usedKey = (jti: string) => `sso-link-used:${jti}`;
const failuresKey = (jti: string) => `sso-link-failures:${jti}`;

export interface SSOLinkTokenPayload {
  /** Random token id; keys the single-use and failure state. */
  jti: string;
  email: string;
  providerId: number;
  providerType: SSOProviderType;
  ssoSubject: string;
  iat: number;
  exp: number;
}

@Injectable()
export class SSOLinkTokenService {
  private readonly logger = new Logger(SSOLinkTokenService.name);
  private readonly defaultTtlMs = 10 * 60 * 1000; // 10 minutes
  private readonly secretParent = 'auth';
  private readonly secretKey = 'sso_link_token_secret';
  private readonly secretRefreshMs = 5 * 60 * 1000; // 5 minutes
  private cachedSecret: string | null = null;
  private lastFetchedAt = 0;

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly encryptionService: EncryptionService,
    @Inject(SESSION_STORE) private readonly sessionStore: SessionStore,
  ) {}

  async issue(payload: Omit<SSOLinkTokenPayload, 'jti' | 'iat' | 'exp'>, ttlMs = this.defaultTtlMs): Promise<string> {
    const now = Date.now();
    const tokenPayload: SSOLinkTokenPayload = {
      ...payload,
      jti: randomBytes(16).toString('base64url'),
      iat: now,
      exp: now + ttlMs,
    };

    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = await this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  async verify(token: string): Promise<SSOLinkTokenPayload> {
    const [encodedPayload, signature] = token?.split('.') ?? [];

    if (!encodedPayload || !signature) {
      throw new BadRequestException('INVALID_LINK_TOKEN');
    }

    const expectedSignature = await this.sign(encodedPayload);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      this.logger.warn('Invalid SSO link token signature');
      throw new UnauthorizedException('INVALID_LINK_TOKEN');
    }

    let payload: SSOLinkTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SSOLinkTokenPayload;
    } catch (error) {
      this.logger.warn('Failed to parse SSO link token payload', error instanceof Error ? error.stack : String(error));
      throw new BadRequestException('INVALID_LINK_TOKEN');
    }

    if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
      throw new UnauthorizedException('INVALID_LINK_TOKEN');
    }

    if (payload.exp < Date.now()) {
      throw new UnauthorizedException('LINK_TOKEN_EXPIRED');
    }

    return payload;
  }

  /** Rejects a token that was already used for linking or that had too many wrong passwords. */
  async assertUsable(payload: SSOLinkTokenPayload): Promise<void> {
    if ((await this.sessionStore.getEphemeralState(usedKey(payload.jti))) !== null) {
      throw new UnauthorizedException('LINK_TOKEN_USED');
    }
    const failures = Number((await this.sessionStore.getEphemeralState(failuresKey(payload.jti))) ?? 0);
    if (failures >= MAX_LINK_TOKEN_PASSWORD_ATTEMPTS) {
      throw new UnauthorizedException('LINK_TOKEN_EXHAUSTED');
    }
  }

  async recordFailedPassword(payload: SSOLinkTokenPayload): Promise<void> {
    await this.sessionStore.incrementEphemeralCounter(failuresKey(payload.jti), payload.exp);
  }

  /** Marks the token used; insert-if-absent, so of concurrent requests only one wins. */
  async consume(payload: SSOLinkTokenPayload): Promise<void> {
    if (!(await this.sessionStore.putEphemeralState(usedKey(payload.jti), '1', payload.exp))) {
      throw new UnauthorizedException('LINK_TOKEN_USED');
    }
  }

  private async sign(encodedPayload: string): Promise<string> {
    const secret = await this.getSecret();

    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }

  private async getSecret(): Promise<string> {
    const now = Date.now();

    if (this.cachedSecret && now - this.lastFetchedAt < this.secretRefreshMs) {
      return this.cachedSecret;
    }

    const existing = await this.settingRepository.findOneBy({
      parent: this.secretParent,
      key: this.secretKey,
    });

    if (existing?.value) {
      const decrypted = this.encryptionService.decryptIfEncrypted(existing.value) ?? existing.value;
      if (!this.encryptionService.isEncrypted(existing.value)) {
        const encrypted = this.encryptionService.encrypt(decrypted);
        await this.settingRepository.update(existing.id, { value: encrypted });
      }
      this.cachedSecret = decrypted;
      this.lastFetchedAt = now;
      return decrypted;
    }

    const generated = randomBytes(64).toString('base64url');
    const encrypted = this.encryptionService.encrypt(generated);

    try {
      await this.settingRepository.insert({
        parent: this.secretParent,
        key: this.secretKey,
        value: encrypted,
      });
      this.cachedSecret = generated;
      this.lastFetchedAt = now;
      return generated;
    } catch (error) {
      this.logger.warn('Race detected when creating SSO link token secret, retrying fetch', error as Error);
      const afterInsert = await this.settingRepository.findOneBy({
        parent: this.secretParent,
        key: this.secretKey,
      });

      if (afterInsert?.value) {
        const decrypted = this.encryptionService.decryptIfEncrypted(afterInsert.value) ?? afterInsert.value;
        if (!this.encryptionService.isEncrypted(afterInsert.value)) {
          const encryptedAfter = this.encryptionService.encrypt(decrypted);
          await this.settingRepository.update(afterInsert.id, { value: encryptedAfter });
        }
        this.cachedSecret = decrypted;
        this.lastFetchedAt = now;
        return decrypted;
      }

      this.logger.error('SSO link token secret could not be created or retrieved', error as Error);
      throw new UnauthorizedException('Server misconfiguration');
    }
  }
}
