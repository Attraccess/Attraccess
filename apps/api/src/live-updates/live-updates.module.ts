import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { Module } from '@nestjs/common';
import { LiveUpdatesController } from './live-updates.controller';
import { LiveUpdatesService } from './live-updates.service';
import { LiveTopicsModule } from './live-topics.module';

@Module({
  imports: [LiveTopicsModule, UsersAndAuthModule],
  controllers: [LiveUpdatesController],
  providers: [LiveUpdatesService],
})
export class LiveUpdatesModule {}
