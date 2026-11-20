import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ApiTokenChanges, ApiTokenPage, ApiTokenRecord, NewApiToken } from '@attraccess/application-models';
import { ApiToken, ApiTokenPermission } from '@attraccess/database-entities';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import type { ApiTokenStore } from '../../../users-and-auth/auth/api-token/api-token.port';

export function toApiTokenRecord(token: ApiToken): ApiTokenRecord {
  return {
    id: token.id,
    userId: token.userId,
    name: token.name,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    permissionKeys: (token.apiTokenPermissions ?? []).map(({ permissionKey }) => permissionKey),
  };
}

async function replacePermissions(
  manager: EntityManager,
  apiTokenId: number,
  permissionKeys: string[],
): Promise<ApiTokenPermission[]> {
  const permissions = manager.getRepository(ApiTokenPermission);
  return permissions.save(
    [...new Set(permissionKeys)].map((permissionKey) => permissions.create({ apiTokenId, permissionKey })),
  );
}

@Injectable()
export class TypeOrmApiTokenStore implements ApiTokenStore {
  constructor(
    @InjectRepository(ApiToken) private readonly tokens: Repository<ApiToken>,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>,
  ) {}

  async listActive(userId: number, page: number, limit: number): Promise<ApiTokenPage> {
    const [rows, total] = await this.tokens.findAndCount({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      relations: { apiTokenPermissions: true },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map(toApiTokenRecord), total };
  }

  create(token: NewApiToken): Promise<ApiTokenRecord> {
    return this.unitOfWork.run(async (scope) => {
      const manager = this.unitOfWork.handleOf(scope);
      const tokens = manager.getRepository(ApiToken);
      const saved = await tokens.save(
        tokens.create({
          userId: token.userId,
          name: token.name,
          tokenHash: token.tokenHash,
          expiresAt: token.expiresAt,
          lastUsedAt: null,
          revokedAt: null,
        }),
      );
      saved.apiTokenPermissions = await replacePermissions(manager, saved.id, token.permissionKeys);
      return toApiTokenRecord(saved);
    });
  }

  async findActiveOwned(userId: number, tokenId: number): Promise<ApiTokenRecord | null> {
    const token = await this.tokens.findOne({
      where: { id: tokenId, userId, revokedAt: IsNull() },
      relations: { apiTokenPermissions: true },
    });
    return token ? toApiTokenRecord(token) : null;
  }

  async findByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const token = await this.tokens.findOne({ where: { tokenHash }, relations: { apiTokenPermissions: true } });
    return token ? toApiTokenRecord(token) : null;
  }

  update(tokenId: number, changes: ApiTokenChanges): Promise<ApiTokenRecord | null> {
    return this.unitOfWork.run(async (scope) => {
      const manager = this.unitOfWork.handleOf(scope);
      const tokens = manager.getRepository(ApiToken);
      const token = await tokens.findOne({ where: { id: tokenId }, relations: { apiTokenPermissions: true } });
      if (!token) return null;
      if (changes.name !== undefined) token.name = changes.name;
      if (changes.permissionKeys !== undefined) {
        await manager.getRepository(ApiTokenPermission).delete({ apiTokenId: token.id });
        token.apiTokenPermissions = await replacePermissions(manager, token.id, changes.permissionKeys);
      }
      if (changes.expiresAt !== undefined) token.expiresAt = changes.expiresAt;
      return toApiTokenRecord(await tokens.save(token));
    });
  }

  async revoke(tokenId: number, revokedAt: Date): Promise<void> {
    await this.tokens.update(tokenId, { revokedAt });
  }

  async touchLastUsed(tokenId: number, usedAt: Date): Promise<boolean> {
    const result = await this.tokens
      .createQueryBuilder()
      .update(ApiToken)
      .set({ lastUsedAt: usedAt })
      .where('id = :id', { id: tokenId })
      .andWhere('"revokedAt" IS NULL')
      .andWhere('("expiresAt" IS NULL OR "expiresAt" > :now)', { now: usedAt })
      .execute();
    return result.affected === 1;
  }
}
