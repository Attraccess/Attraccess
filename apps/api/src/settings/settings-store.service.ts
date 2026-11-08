import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Setting } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { APP_PARENT, SETTINGS_CACHE_TTL_MS } from './constants';

type CachedSetting = {
  value: string | null;
  configured: boolean;
  expiresAt: number;
};

@Injectable()
export class SettingsStoreService {
  private readonly logger = new Logger(SettingsStoreService.name);
  private readonly cache = new Map<string, CachedSetting>();

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async get(key: string): Promise<string | null> {
    return this.getPlainSetting(APP_PARENT, key);
  }

  /**
   * With a transaction, a cache miss reads through it (no wait on another connection) and is not cached,
   * because the transaction may still roll back.
   */
  async getPlainSetting(parent: string, key: string, transaction?: EntityManager): Promise<string | null> {
    const cacheKey = this.getCacheKey(parent, key);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached.value;
    }

    if (transaction) {
      const row = await transaction.getRepository(Setting).findOneBy({ parent, key });
      return row?.value ?? null;
    }

    const existing = await this.settingRepository.findOneBy({ parent, key });
    if (existing) {
      this.setCache(cacheKey, existing.value, true);
      return existing.value;
    }
    this.setCache(cacheKey, null, false);
    return null;
  }

  async getSecretSetting(
    parent: string,
    key: string,
  ): Promise<{ value: string | null; configured: boolean }> {
    const cacheKey = this.getCacheKey(parent, key);
    const cached = this.getCached(cacheKey);
    if (cached) {
      return { value: cached.value, configured: cached.configured };
    }

    const existing = await this.settingRepository.findOneBy({ parent, key });
    if (existing?.value) {
      const decrypted = this.decryptSecret(parent, key, existing.value);
      this.setCache(cacheKey, decrypted, true);
      return { value: decrypted, configured: true };
    }
    this.setCache(cacheKey, null, false);
    return { value: null, configured: false };
  }

  async setPlainSetting(parent: string, key: string, value: string | null): Promise<void> {
    const cacheKey = this.getCacheKey(parent, key);
    const normalized = this.normalizeString(value);
    if (!normalized) {
      await this.settingRepository.delete({ parent, key });
      this.setCache(cacheKey, null, false);
      return;
    }

    await this.upsertSetting(parent, key, normalized);
    this.setCache(cacheKey, normalized, true);
  }

  async setSecretSetting(parent: string, key: string, value: string | null): Promise<void> {
    const cacheKey = this.getCacheKey(parent, key);
    const normalized = this.normalizeString(value);
    if (!normalized) {
      await this.settingRepository.delete({ parent, key });
      this.setCache(cacheKey, null, false);
      return;
    }

    const encrypted = this.encryptionService.encrypt(normalized);
    await this.upsertSetting(parent, key, encrypted);
    this.setCache(cacheKey, normalized, true);
  }

  private getCacheKey(parent: string, key: string): string {
    return `${parent}:${key}`;
  }

  private getCached(cacheKey: string): CachedSetting | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    return cached;
  }

  private setCache(cacheKey: string, value: string | null, configured: boolean): void {
    this.cache.set(cacheKey, {
      value,
      configured,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    });
  }

  private normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Single-statement writes: save() would wrap the change in a deferred read-then-write transaction, which SQLite
   * fails with SQLITE_BUSY at once (no busy wait) when another connection holds the write lock.
   */
  private async upsertSetting(parent: string, key: string, value: string): Promise<void> {
    const existing = await this.settingRepository.findOneBy({ parent, key });
    if (existing) {
      await this.settingRepository.update(existing.id, { value });
    } else {
      await this.settingRepository.insert({ parent, key, value });
    }
  }

  private decryptSecret(parent: string, key: string, value: string): string {
    try {
      return this.encryptionService.decrypt(value);
    } catch (error) {
      this.logger.warn(`Failed to decrypt setting ${parent}:${key}, falling back to raw value`, error as Error);
      return value;
    }
  }
}
