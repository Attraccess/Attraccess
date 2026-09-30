import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Resource, Project, ResourceUsage, Session } from '@attraccess/database-entities';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Resource, Project, ResourceUsage, Session])],
  controllers: [VersionController],
  providers: [VersionService],
  exports: [VersionService],
})
export class VersionModule {}
