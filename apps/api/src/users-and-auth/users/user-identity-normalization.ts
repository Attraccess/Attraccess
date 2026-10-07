import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { QueryFailedError } from 'typeorm';
import { UsersServiceRouteContext } from './users.service.route-context';
export abstract class UserIdentityNormalizationImplementation extends UsersServiceRouteContext {
  public validateUsernameOrThrow(username: string): void {
    const trimmed = (username ?? '').trim();
    // Centralized username validation rules
    const minLength = 3;
    const maxLength = 32;
    const allowed = /^[a-zA-Z0-9_\-.]+$/;

    if (trimmed.length < minLength || trimmed.length > maxLength) {
      throw new BadRequestException('Invalid username length');
    }
    if (!allowed.test(trimmed)) {
      throw new BadRequestException('Invalid username format');
    }
  }

  public cleanupUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  protected normalizeUsernameCandidate(value: string): string {
    const cleaned = this.cleanupUsername(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_.-]+/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^[._-]+|[._-]+$/g, '');
    return cleaned;
  }

  public buildUsernameFromSSOClaim(rawUsername?: string | null, fallback?: string): string {
    const candidates = [rawUsername, fallback].filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    );

    for (const candidate of candidates) {
      const normalized = this.normalizeUsernameCandidate(candidate);
      if (!normalized) {
        continue;
      }

      const truncated = normalized.slice(0, 32).replace(/[._-]+$/g, '');
      if (!truncated) {
        continue;
      }

      try {
        this.validateUsernameOrThrow(truncated);
        return truncated;
      } catch {
        continue;
      }
    }

    const suffix = randomBytes(6).toString('base64url').slice(0, 8).toLowerCase();
    return `sso-user-${suffix}`;
  }

  protected isEmailUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = (
      error as QueryFailedError & { driverError?: { code?: string | number; errno?: number; message?: string } }
    ).driverError;
    const errorCode = driverError?.code ?? driverError?.errno;
    if (
      errorCode === '23505' ||
      errorCode === 'SQLITE_CONSTRAINT' ||
      errorCode === 'SQLITE_CONSTRAINT_UNIQUE' ||
      errorCode === 'ER_DUP_ENTRY' ||
      errorCode === 1062
    ) {
      return true;
    }

    const message = driverError?.message ?? '';
    return (
      typeof message === 'string' && message.toLowerCase().includes('unique') && message.toLowerCase().includes('email')
    );
  }
}
