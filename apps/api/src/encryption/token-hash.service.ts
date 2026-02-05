import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, hkdfSync } from 'crypto';
import { AppConfigType } from '../config/app.config';

const KEY_LENGTH_BYTES = 32;

@Injectable()
export class TokenHashService {
  private cachedKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getHashKey(): Buffer {
    if (this.cachedKey) {
      return this.cachedKey;
    }

    const appConfig = this.configService.get<AppConfigType>('app');
    const secret = appConfig?.AUTH_SESSION_SECRET;
    if (!secret || secret.length === 0) {
      throw new Error('AUTH_SESSION_SECRET is required for token hashing');
    }

    const salt = Buffer.from('attraccess.token-hash.salt', 'utf8');
    const info = Buffer.from('attraccess|token-hash|sha256', 'utf8');
    const derived = hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, info, KEY_LENGTH_BYTES);
    this.cachedKey = Buffer.from(derived as unknown as ArrayBuffer);
    return this.cachedKey;
  }

  hashToken(token: string): string {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TypeError('hashToken: token must be a non-empty string');
    }

    const key = this.getHashKey();
    return createHmac('sha256', key).update(token, 'utf8').digest('base64url');
  }
}
