import { Module } from '@nestjs/common';
import { ResourceUsageModule } from '../usage/resourceUsage.module';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveService } from './supervision-live.service';
/**
 * Supervised-session approval lifecycle: request -> realtime delivery to supervisor -> approve/reject
 * (or 30s timeout) -> start the session via the existing usage start path with the supervisor attached.
 */
@Module({
  imports: [ResourceUsageModule],
  controllers: [SupervisionController],
  providers: [SupervisionService, SupervisionLiveService],
  exports: [SupervisionService, SupervisionLiveService],
})
export class SupervisionModule {}
