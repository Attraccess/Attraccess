import { ResourceEventPersistence } from '../persistence/port';
import { TypeormResourceEventPersistence } from '../persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';
import { SSEController } from './sse.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Resource])],
  controllers: [SSEController],
  providers: [ResourceEventsService, { provide: ResourceEventPersistence, useClass: TypeormResourceEventPersistence }],
  exports: [ResourceEventsService, ResourceEventPersistence],
})
export class SSEModule {}
