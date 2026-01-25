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

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    TypeOrmModule.forFeature([Project, ProjectMember, ProjectInvitation, ResourceUsage, BillingTransaction, Setting, User]),
    FileStorageModule,
  ],
  controllers: [ProjectsController, ProjectInvitationsController],
  providers: [ProjectsService, ProjectUsageService, ProjectAccessService],
  exports: [ProjectsService, ProjectUsageService, ProjectAccessService],
})
export class ProjectsModule {}
