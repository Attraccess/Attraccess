import { Module } from '@nestjs/common';
import { LiveTopicsService } from './live-topics.service';

/** Shared registry with no dependency on any feature module or producer. */
@Module({
  providers: [LiveTopicsService],
  exports: [LiveTopicsService],
})
export class LiveTopicsModule {}
