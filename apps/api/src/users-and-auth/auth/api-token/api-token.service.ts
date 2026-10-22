import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { ApiToken, User } from '@attraccess/application-models';
import { ApiTokenPersistence } from '../persistence/port';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { RbacService } from '../../rbac/rbac.service';

const LAST_USED_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class ApiTokenService {
  constructor(
    private readonly persistence: ApiTokenPersistence,
    private readonly tokenHashService: TokenHashService,
    private readonly rbacService: RbacService,
  ) {}

  async list(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{ data: ApiToken[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.persistence.activePage(userId, page, limit);
    return { data, total, page, limit };
  }

  async create(
    userId: number,
    input: { name: string; permissionKeys: string[]; expiresAt?: Date },
  ): Promise<{ apiToken: ApiToken; token: string }> {
    await this.assertAllowedPermissions(userId, input.permissionKeys);
    this.assertExpiry(input.expiresAt);

    const token = randomBytes(32).toString('base64url');
    const apiToken = await this.persistence.createToken(
      {
        userId,
        name: input.name.trim(),
        tokenHash: this.tokenHashService.hashApiToken(token),
        expiresAt: input.expiresAt ?? null,
        lastUsedAt: null,
        revokedAt: null,
      },
      [...new Set(input.permissionKeys)],
    );
    return { apiToken, token };
  }

  async update(
    userId: number,
    tokenId: number,
    input: { name?: string; permissionKeys?: string[]; expiresAt?: Date | null },
  ): Promise<ApiToken> {
    const apiToken = await this.findOwned(userId, tokenId);
    if (input.permissionKeys) await this.assertAllowedPermissions(userId, input.permissionKeys);
    if (input.expiresAt !== null) this.assertExpiry(input.expiresAt);
    if (input.name !== undefined) apiToken.name = input.name.trim();
    if (input.expiresAt !== undefined) apiToken.expiresAt = input.expiresAt;
    return this.persistence.updateToken(
      apiToken,
      input.permissionKeys === undefined ? undefined : [...new Set(input.permissionKeys)],
    );
  }

  async revoke(userId: number, tokenId: number): Promise<void> {
    const apiToken = await this.findOwned(userId, tokenId);
    apiToken.revokedAt = new Date();
    await this.persistence.saveToken(apiToken);
  }

  async authenticate(token: string): Promise<{ user: User; apiToken: ApiToken } | null> {
    const apiToken = await this.persistence.findByHash(this.tokenHashService.hashApiToken(token));
    if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt <= new Date())) return null;

    // The normal repository lookup excludes soft-deleted owners.
    const user = await this.persistence.findOwner(apiToken.userId);
    if (!user || user.isDisabled) return null;

    if (!apiToken.lastUsedAt || Date.now() - apiToken.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
      const now = new Date();
      if (!(await this.persistence.touchActive(apiToken.id, now))) return null;
    }
    return { user, apiToken };
  }

  private async findOwned(userId: number, tokenId: number): Promise<ApiToken> {
    const apiToken = await this.persistence.findOwned(userId, tokenId);
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
