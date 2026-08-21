import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, hkdfSync } from 'crypto';
import { AppConfigType } from '../config/app.config';

const KEY_LENGTH_BYTES = 32;

@Injectable()
export class TokenHashService {
  private readonly cachedKeys = new Map<string, Buffer>();

  constructor(private readonly configService: ConfigService) {}

  private getHashKey(context = 'session'): Buffer {
    const cached = this.cachedKeys.get(context);
    if (cached) {
      return cached;
    }

    const appConfig = this.configService.get<AppConfigType>('app');
    const secret = appConfig?.AUTH_SESSION_SECRET;
    if (!secret || secret.length === 0) {
      throw new Error('AUTH_SESSION_SECRET is required for token hashing');
    }

    const salt = Buffer.from('attraccess.token-hash.salt', 'utf8');
    const info = Buffer.from(`attraccess|${context}-token-hash|sha256`, 'utf8');
    const derived = hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, info, KEY_LENGTH_BYTES);
    const key = Buffer.from(derived as unknown as ArrayBuffer);
    this.cachedKeys.set(context, key);
    return key;
  }

  hashToken(token: string): string {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TypeError('hashToken: token must be a non-empty string');
    }

    const key = this.getHashKey();
    return createHmac('sha256', key).update(token, 'utf8').digest('base64url');
  }

  hashApiToken(token: string): string {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TypeError('hashApiToken: token must be a non-empty string');
    }
    return createHmac('sha256', this.getHashKey('api')).update(token, 'utf8').digest('base64url');
  }
}
