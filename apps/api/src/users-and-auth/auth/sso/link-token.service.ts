import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../../config/app.config';
import { SSOProviderType } from '@attraccess/database-entities';

export interface SSOLinkTokenPayload {
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

  constructor(private readonly configService: ConfigService) {}

  issue(
    payload: Pick<SSOLinkTokenPayload, 'email' | 'providerId' | 'providerType' | 'ssoSubject'>,
    ttlMs = this.defaultTtlMs,
  ): string {
    const now = Date.now();
    const tokenPayload: SSOLinkTokenPayload = {
      ...payload,
      iat: now,
      exp: now + ttlMs,
    };

    const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = this.sign(encodedPayload);

    return `${encodedPayload}.${signature}`;
  }

  verify(token: string): SSOLinkTokenPayload {
    const [encodedPayload, signature] = token?.split('.') ?? [];

    if (!encodedPayload || !signature) {
      throw new BadRequestException('INVALID_LINK_TOKEN');
    }

    const expectedSignature = this.sign(encodedPayload);
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

    if (payload.exp < Date.now()) {
      throw new UnauthorizedException('LINK_TOKEN_EXPIRED');
    }

    return payload;
  }

  private sign(encodedPayload: string): string {
    const secret = this.configService.get<AppConfigType>('app')?.AUTH_SESSION_SECRET;

    if (!secret) {
      this.logger.error('AUTH_SESSION_SECRET is not configured');
      throw new UnauthorizedException('Server misconfiguration');
    }

    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }
}

