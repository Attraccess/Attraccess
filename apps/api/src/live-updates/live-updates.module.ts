import { Module } from '@nestjs/common';
import { LiveUpdatesController } from './live-updates.controller';
import { LiveUpdatesService } from './live-updates.service';
import { LiveTopicsModule } from './live-topics.module';

@Module({
  imports: [LiveTopicsModule],
  controllers: [LiveUpdatesController],
  providers: [LiveUpdatesService],
})
export class LiveUpdatesModule {}
