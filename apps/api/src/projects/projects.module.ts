import { ProjectAccessPersistence, ProjectPersistence, ProjectUsagePersistence } from './persistence/port';
import {
  TypeormProjectAccessPersistence,
  TypeormProjectPersistence,
  TypeormProjectUsagePersistence,
} from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './projects.controller';
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
import { FileStorageModule } from '../common/modules/file-storage.module';
import { ProjectUsageService } from './project-usage.service';
import { ProjectAccessService } from './project-access.service';
import { EmailModule } from '../email/email.module';
import { ProjectInvitationsController } from './project-invitations.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      ProjectInvitation,
      ResourceUsage,
      BillingTransaction,
      Setting,
      User,
    ]),
    FileStorageModule,
  ],
  controllers: [ProjectsController, ProjectInvitationsController],
  providers: [
    { provide: ProjectAccessPersistence, useClass: TypeormProjectAccessPersistence },
    ProjectsService,
    { provide: ProjectPersistence, useClass: TypeormProjectPersistence },
    ProjectUsageService,
    { provide: ProjectUsagePersistence, useClass: TypeormProjectUsagePersistence },
    ProjectAccessService,
  ],
  exports: [ProjectsService, ProjectUsageService, ProjectAccessService],
})
export class ProjectsModule {}
