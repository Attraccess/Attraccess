import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';
import { SSEController } from './sse.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Resource])],
  controllers: [SSEController],
  providers: [ResourceEventsService],
  exports: [ResourceEventsService],
})
export class SSEModule {}
