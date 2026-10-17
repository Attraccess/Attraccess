import { Module } from '@nestjs/common';
import { ResourceUsageModule } from '../usage/resourceUsage.module';
import { ResourceIntroducersModule } from '../introducers/resourceIntroducers.module';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveService } from './supervision-live.service';
import { RbacModule } from '../../users-and-auth/rbac/rbac.module';
import { LiveTopicsModule } from '../../live-updates/live-topics.module';
import { SupervisionLiveTopicsProvider } from './supervision-live-topics.provider';
/**
 * Supervised-session approval lifecycle: request -> realtime delivery to supervisor -> approve/reject
 * (or 30s timeout) -> start the session via the existing usage start path with the supervisor attached.
 */
@Module({
  imports: [ResourceUsageModule, ResourceIntroducersModule, RbacModule, LiveTopicsModule],
  controllers: [SupervisionController],
  providers: [SupervisionService, SupervisionLiveService, SupervisionLiveTopicsProvider],
  exports: [SupervisionService, SupervisionLiveService],
})
export class SupervisionModule {}
