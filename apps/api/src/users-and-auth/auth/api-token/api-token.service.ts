import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { ApiToken, ApiTokenPermission, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { RbacService } from '../../rbac/rbac.service';

const LAST_USED_WRITE_INTERVAL_MS = 60_000;

@Injectable()
export class ApiTokenService {
  constructor(
    @InjectRepository(ApiToken) private readonly apiTokenRepository: Repository<ApiToken>,
    @InjectRepository(ApiTokenPermission) private readonly apiTokenPermissionRepository: Repository<ApiTokenPermission>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly tokenHashService: TokenHashService,
    private readonly rbacService: RbacService,
  ) {}

  async list(userId: number): Promise<ApiToken[]> {
    return this.apiTokenRepository.find({
      where: { userId, revokedAt: null },
      order: { createdAt: 'DESC' },
      relations: { apiTokenPermissions: true },
    });
  }

  async create(
    userId: number,
    input: { name: string; permissionKeys: string[]; expiresAt?: Date },
  ): Promise<{ apiToken: ApiToken; token: string }> {
    await this.assertAllowedPermissions(userId, input.permissionKeys);
    this.assertExpiry(input.expiresAt);

    const token = randomBytes(32).toString('base64url');
    const apiToken = await this.apiTokenRepository.save(
      this.apiTokenRepository.create({
        userId,
        name: input.name.trim(),
        tokenHash: this.tokenHashService.hashApiToken(token),
        expiresAt: input.expiresAt ?? null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    apiToken.apiTokenPermissions = await this.createPermissions(apiToken.id, input.permissionKeys);
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
    if (input.permissionKeys !== undefined) {
      await this.apiTokenPermissionRepository.delete({ apiTokenId: apiToken.id });
      apiToken.apiTokenPermissions = await this.createPermissions(apiToken.id, input.permissionKeys);
    }
    if (input.expiresAt !== undefined) apiToken.expiresAt = input.expiresAt;
    return this.apiTokenRepository.save(apiToken);
  }

  async revoke(userId: number, tokenId: number): Promise<void> {
    const apiToken = await this.findOwned(userId, tokenId);
    apiToken.revokedAt = new Date();
    await this.apiTokenRepository.save(apiToken);
  }

  async authenticate(token: string): Promise<{ user: User; apiToken: ApiToken } | null> {
    const apiToken = await this.apiTokenRepository.findOne({
      where: { tokenHash: this.tokenHashService.hashApiToken(token) },
      relations: { apiTokenPermissions: true },
    });
    if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt <= new Date())) return null;

    // The normal repository lookup excludes soft-deleted owners.
    const user = await this.userRepository.findOneBy({ id: apiToken.userId });
    if (!user || user.isDisabled) return null;

    if (!apiToken.lastUsedAt || Date.now() - apiToken.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
      const now = new Date();
      const result = await this.apiTokenRepository
        .createQueryBuilder()
        .update(ApiToken)
        .set({ lastUsedAt: now })
        .where('id = :id', { id: apiToken.id })
        .andWhere('revokedAt IS NULL')
        .andWhere('(expiresAt IS NULL OR expiresAt > :now)', { now })
        .execute();
      if (result.affected !== 1) return null;
    }
    return { user, apiToken };
  }

  private async findOwned(userId: number, tokenId: number): Promise<ApiToken> {
    const apiToken = await this.apiTokenRepository.findOne({
      where: { id: tokenId, userId, revokedAt: null },
      relations: { apiTokenPermissions: true },
    });
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

  private async createPermissions(apiTokenId: number, permissionKeys: string[]): Promise<ApiTokenPermission[]> {
    return this.apiTokenPermissionRepository.save(
      [...new Set(permissionKeys)].map((permissionKey) => this.apiTokenPermissionRepository.create({ apiTokenId, permissionKey })),
    );
  }

  private assertExpiry(expiresAt: Date | undefined): void {
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('ApiTokenExpiryMustBeInFuture');
  }
}
