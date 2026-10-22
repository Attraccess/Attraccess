import { VersionPersistence } from './persistence/port';
import { TypeormVersionPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Resource, Project, ResourceUsage, Session } from '@attraccess/database-entities';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Resource, Project, ResourceUsage, Session])],
  controllers: [VersionController],
  providers: [VersionService, { provide: VersionPersistence, useClass: TypeormVersionPersistence }],
  exports: [VersionService],
})
export class VersionModule {}
