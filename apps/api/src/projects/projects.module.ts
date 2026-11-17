import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './projects.controller';
import { ProjectsPersistenceModule } from '../database/adapters/projects/projects-persistence.module';
import { FileStorageModule } from '../common/modules/file-storage.module';
import { ProjectUsageService } from './project-usage.service';
import { ProjectAccessService } from './project-access.service';
import { EmailModule } from '../email/email.module';
import { ProjectInvitationsController } from './project-invitations.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, EmailModule, NotificationsModule, ProjectsPersistenceModule, FileStorageModule],
  controllers: [ProjectsController, ProjectInvitationsController],
  providers: [ProjectsService, ProjectUsageService, ProjectAccessService],
  exports: [ProjectsService, ProjectUsageService, ProjectAccessService],
})
export class ProjectsModule {}
