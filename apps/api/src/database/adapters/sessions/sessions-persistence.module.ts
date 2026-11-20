import { Module } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SESSION_USER_DIRECTORY } from '../../../users-and-auth/auth/session-store/session-user-directory.port';
import { SqliteSessionStore } from './sqlite-session-store';
import { TypeOrmSessionUserDirectory } from './typeorm-session-user-directory';

/** The database-backed session store: sessions in the SQL database, used unless Valkey is configured. */
export const DATABASE_SESSION_STORE = Symbol.for('attraccess.auth.database-session-store');

/** Session persistence. TokenHashService comes from the global EncryptionModule. */
@Module({
  imports: [TypeOrmModule.forFeature([Session, User])],
  providers: [
    TypeOrmSessionUserDirectory,
    { provide: SESSION_USER_DIRECTORY, useExisting: TypeOrmSessionUserDirectory },
    {
      provide: DATABASE_SESSION_STORE,
      inject: [getRepositoryToken(Session), TokenHashService],
      useFactory: (sessions: Repository<Session>, tokenHashService: TokenHashService) =>
        new SqliteSessionStore(sessions, tokenHashService),
    },
  ],
  exports: [DATABASE_SESSION_STORE, SESSION_USER_DIRECTORY],
})
export class SessionsPersistenceModule {}
