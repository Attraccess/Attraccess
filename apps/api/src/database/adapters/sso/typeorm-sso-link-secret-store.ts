import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '@attraccess/database-entities';
import { isUniqueViolation } from '../../persistence-errors';
import type { SsoLinkSecretStore } from '../../../users-and-auth/auth/sso/link-token-secret.port';

const PARENT = 'auth';
const KEY = 'sso_link_token_secret';

/** The signing key lives in the settings table under auth / sso_link_token_secret. */
@Injectable()
export class TypeOrmSsoLinkSecretStore implements SsoLinkSecretStore {
  constructor(@InjectRepository(Setting) private readonly settings: Repository<Setting>) {}

  async read(): Promise<string | null> {
    return (await this.settings.findOneBy({ parent: PARENT, key: KEY }))?.value || null;
  }

  async replace(value: string): Promise<void> {
    await this.settings.update({ parent: PARENT, key: KEY }, { value });
  }

  async createIfAbsent(value: string): Promise<boolean> {
    try {
      await this.settings.insert({ parent: PARENT, key: KEY, value });
      return true;
    } catch (error) {
      // Another instance created the secret between our read and this insert.
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }
}
