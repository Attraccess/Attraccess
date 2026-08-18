import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthenticationDetail, ResourceIntroduction, User } from '@attraccess/database-entities';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { SettingsModule } from '../settings/settings.module';
import { GuestsService } from './guests.service';
import { GuestsController } from './guests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuthenticationDetail, ResourceIntroduction]),
    UsersAndAuthModule,
    SettingsModule,
  ],
  controllers: [GuestsController],
  providers: [GuestsService],
  exports: [GuestsService],
})
export class GuestsModule {}
