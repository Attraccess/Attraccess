import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Passkey, PasskeyChallenge, User } from '@attraccess/database-entities';
import { PASSKEY_STORE } from '../../../users-and-auth/auth/passkey/passkey.port';
import { TypeOrmPasskeyStore } from './typeorm-passkey-store';

@Module({
  imports: [TypeOrmModule.forFeature([Passkey, PasskeyChallenge, User])],
  providers: [TypeOrmPasskeyStore, { provide: PASSKEY_STORE, useExisting: TypeOrmPasskeyStore }],
  exports: [PASSKEY_STORE],
})
export class PasskeysPersistenceModule {}
