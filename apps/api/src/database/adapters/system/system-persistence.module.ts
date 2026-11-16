import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project, Resource, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { SYSTEM_STATS_STORE } from '../../../version/system-stats.port';
import { TypeOrmSystemStatsStore } from './typeorm-system-stats.store';

@Module({
  imports: [TypeOrmModule.forFeature([User, Resource, Project, ResourceUsage, Session])],
  providers: [{ provide: SYSTEM_STATS_STORE, useClass: TypeOrmSystemStatsStore }],
  exports: [SYSTEM_STATS_STORE],
})
export class SystemPersistenceModule {}
