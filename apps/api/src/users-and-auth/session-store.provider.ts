import { Session, User } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { Repository } from 'typeorm';
import { TokenHashService } from '../encryption/token-hash.service';
import { VALKEY_CLIENT } from '../valkey/valkey.module';
import { SESSION_STORE, SessionStore } from './auth/session-store/session-store';
import { SqliteSessionStore } from './auth/session-store/sqlite.session-store';
import { ValkeySessionStore } from './auth/session-store/valkey.session-store';
export const sessionStoreProvider = {
  provide: SESSION_STORE,
  inject: [
    { token: VALKEY_CLIENT, optional: true },
    getRepositoryToken(Session),
    getRepositoryToken(User),
    TokenHashService,
  ],
  useFactory: (
    valkeyClient: Redis | null,
    sessionRepo: Repository<Session>,
    userRepo: Repository<User>,
    tokenHashService: TokenHashService,
  ): SessionStore => {
    if (valkeyClient) {
      return new ValkeySessionStore(valkeyClient, userRepo, tokenHashService);
    }
    return new SqliteSessionStore(sessionRepo, tokenHashService);
  },
};
