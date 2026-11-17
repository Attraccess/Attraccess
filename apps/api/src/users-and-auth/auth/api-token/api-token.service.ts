import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { ApiTokenRecord, AuthenticatedSessionUser } from '@attraccess/application-models';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { RbacService } from '../../rbac/rbac.service';
import { SESSION_USER_DIRECTORY, SessionUserDirectory } from '../session-store/session-user-directory.port';
import { API_TOKEN_STORE, ApiTokenStore } from './api-token.port';

const LAST_USED_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class ApiTokenService {
  constructor(
    @Inject(API_TOKEN_STORE) private readonly tokens: ApiTokenStore,
    @Inject(SESSION_USER_DIRECTORY) private readonly users: SessionUserDirectory,
    private readonly tokenHashService: TokenHashService,
    private readonly rbacService: RbacService,
  ) {}

  async list(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{ data: ApiTokenRecord[]; total: number; page: number; limit: number }> {
    const { data, total } = await this.tokens.listActive(userId, page, limit);
    return { data, total, page, limit };
  }

  async create(
    userId: number,
    input: { name: string; permissionKeys: string[]; expiresAt?: Date },
  ): Promise<{ apiToken: ApiTokenRecord; token: string }> {
    await this.assertAllowedPermissions(userId, input.permissionKeys);
    this.assertExpiry(input.expiresAt);

    const token = randomBytes(32).toString('base64url');
    const apiToken = await this.tokens.create({
      userId,
      name: input.name.trim(),
      tokenHash: this.tokenHashService.hashApiToken(token),
      expiresAt: input.expiresAt ?? null,
      permissionKeys: [...new Set(input.permissionKeys)],
    });
    return { apiToken, token };
  }

  async update(
    userId: number,
    tokenId: number,
    input: { name?: string; permissionKeys?: string[]; expiresAt?: Date | null },
  ): Promise<ApiTokenRecord> {
    await this.findOwned(userId, tokenId);
    if (input.permissionKeys) await this.assertAllowedPermissions(userId, input.permissionKeys);
    if (input.expiresAt !== null) this.assertExpiry(input.expiresAt);
    const updated = await this.tokens.update(tokenId, {
      name: input.name === undefined ? undefined : input.name.trim(),
      permissionKeys: input.permissionKeys,
      expiresAt: input.expiresAt,
    });
    if (!updated) throw new NotFoundException('ApiTokenNotFound');
    return updated;
  }

  async revoke(userId: number, tokenId: number): Promise<void> {
    const apiToken = await this.findOwned(userId, tokenId);
    await this.tokens.revoke(apiToken.id, new Date());
  }

  async authenticate(token: string): Promise<{ user: AuthenticatedSessionUser; apiToken: ApiTokenRecord } | null> {
    const apiToken = await this.tokens.findByHash(this.tokenHashService.hashApiToken(token));
    if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt <= new Date())) return null;

    // The directory excludes soft-deleted owners.
    const user = await this.users.findSessionUser(apiToken.userId);
    if (!user || user.isDisabled) return null;

    if (!apiToken.lastUsedAt || Date.now() - apiToken.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
      if (!(await this.tokens.touchLastUsed(apiToken.id, new Date()))) return null;
    }
    return { user, apiToken };
  }

  private async findOwned(userId: number, tokenId: number): Promise<ApiTokenRecord> {
    const apiToken = await this.tokens.findActiveOwned(userId, tokenId);
    if (!apiToken) throw new NotFoundException('ApiTokenNotFound');
    return apiToken;
  }

  private async assertAllowedPermissions(userId: number, requested: string[]): Promise<void> {
    // A session principal can outlive the RBAC cache, so delegation must use current permissions.
    const allowed = await this.rbacService.getEffectivePermissions(userId, true);
    const disallowed = requested.filter((permission) => !allowed.has(permission));
    if (disallowed.length) {
      throw new ForbiddenException(`You cannot grant permissions you do not hold: ${disallowed.join(', ')}`);
    }
  }

  private assertExpiry(expiresAt: Date | undefined): void {
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('ApiTokenExpiryMustBeInFuture');
  }
}
