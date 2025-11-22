import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './projects.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, Project, ResourceUsage } from '@attraccess/database-entities';
import { FileStorageModule } from '../common/modules/file-storage.module';
import { ProjectUsageService } from './project-usage.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Project, ResourceUsage, BillingTransaction]),
    FileStorageModule,
    BillingModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectUsageService],
  exports: [ProjectsService, ProjectUsageService],
})
export class ProjectsModule {}
