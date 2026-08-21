import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { ApiToken, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { TokenHashService } from '../../../encryption/token-hash.service';

const LAST_USED_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class ApiTokenService {
  constructor(
    @InjectRepository(ApiToken) private readonly apiTokenRepository: Repository<ApiToken>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly tokenHashService: TokenHashService,
  ) {}

  async list(userId: number): Promise<ApiToken[]> {
    return this.apiTokenRepository.find({
      where: { userId, revokedAt: null },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    userId: number,
    allowedPermissions: Set<string>,
    input: { name: string; permissionKeys: string[]; expiresAt?: Date },
  ): Promise<{ apiToken: ApiToken; token: string }> {
    this.assertAllowedPermissions(input.permissionKeys, allowedPermissions);
    this.assertExpiry(input.expiresAt);

    const token = randomBytes(32).toString('base64url');
    const apiToken = await this.apiTokenRepository.save(
      this.apiTokenRepository.create({
        userId,
        name: input.name.trim(),
        tokenHash: this.tokenHashService.hashApiToken(token),
        permissionKeys: [...new Set(input.permissionKeys)],
        expiresAt: input.expiresAt ?? null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return { apiToken, token };
  }

  async update(
    userId: number,
    tokenId: number,
    allowedPermissions: Set<string>,
    input: { name?: string; permissionKeys?: string[]; expiresAt?: Date | null },
  ): Promise<ApiToken> {
    const apiToken = await this.findOwned(userId, tokenId);
    if (input.permissionKeys) this.assertAllowedPermissions(input.permissionKeys, allowedPermissions);
    if (input.expiresAt !== null) this.assertExpiry(input.expiresAt);
    if (input.name !== undefined) apiToken.name = input.name.trim();
    if (input.permissionKeys !== undefined) apiToken.permissionKeys = [...new Set(input.permissionKeys)];
    if (input.expiresAt !== undefined) apiToken.expiresAt = input.expiresAt;
    return this.apiTokenRepository.save(apiToken);
  }

  async revoke(userId: number, tokenId: number): Promise<void> {
    const apiToken = await this.findOwned(userId, tokenId);
    apiToken.revokedAt = new Date();
    await this.apiTokenRepository.save(apiToken);
  }

  async authenticate(token: string): Promise<{ user: User; apiToken: ApiToken } | null> {
    const apiToken = await this.apiTokenRepository.findOneBy({ tokenHash: this.tokenHashService.hashApiToken(token) });
    if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt <= new Date())) return null;

    // The normal repository lookup excludes soft-deleted owners.
    const user = await this.userRepository.findOneBy({ id: apiToken.userId });
    if (!user || user.isDisabled) return null;

    if (!apiToken.lastUsedAt || Date.now() - apiToken.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
      apiToken.lastUsedAt = new Date();
      await this.apiTokenRepository.save(apiToken);
    }
    return { user, apiToken };
  }

  private async findOwned(userId: number, tokenId: number): Promise<ApiToken> {
    const apiToken = await this.apiTokenRepository.findOneBy({ id: tokenId, userId, revokedAt: null });
    if (!apiToken) throw new NotFoundException('ApiTokenNotFound');
    return apiToken;
  }

  private assertAllowedPermissions(requested: string[], allowed: Set<string>): void {
    const disallowed = requested.filter((permission) => !allowed.has(permission));
    if (disallowed.length) {
      throw new ForbiddenException(`You cannot grant permissions you do not hold: ${disallowed.join(', ')}`);
    }
  }

  private assertExpiry(expiresAt: Date | undefined): void {
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('ApiTokenExpiryMustBeInFuture');
  }
}
