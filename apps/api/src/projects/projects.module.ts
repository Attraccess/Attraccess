import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ConfigModule } from '@nestjs/config';
import { ProjectsController } from './projects.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '@attraccess/database-entities';
import { FileStorageModule } from '../common/modules/file-storage.module';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Project]), FileStorageModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
