import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BillingTransaction,
  Project,
  ProjectInvitation,
  ProjectMember,
  ResourceUsage,
  Setting,
  User,
} from '@attraccess/database-entities';
import { PROJECT_INVITATION_STORE, PROJECT_STORE, PROJECT_USAGE_STORE } from '../../../projects/project.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmProjectInvitationStore } from './typeorm-project-invitation.store';
import { TypeOrmProjectStore } from './typeorm-project.store';
import { TypeOrmProjectUsageStore } from './typeorm-project-usage.store';

@Module({
  imports: [
    UnitOfWorkModule,
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      ProjectInvitation,
      ResourceUsage,
      BillingTransaction,
      Setting,
      User,
    ]),
  ],
  providers: [
    { provide: PROJECT_STORE, useClass: TypeOrmProjectStore },
    { provide: PROJECT_INVITATION_STORE, useClass: TypeOrmProjectInvitationStore },
    { provide: PROJECT_USAGE_STORE, useClass: TypeOrmProjectUsageStore },
  ],
  exports: [PROJECT_STORE, PROJECT_INVITATION_STORE, PROJECT_USAGE_STORE, UnitOfWorkModule],
})
export class ProjectsPersistenceModule {}
