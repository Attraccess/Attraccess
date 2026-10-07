import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { installInheritedMethods } from '../common/inherited-implementation';
import { FileStorageService } from '../common/services/file-storage.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectUsageService } from './project-usage.service';
import { ProjectWritingRoutesImplementation } from './project-writing.routes';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController extends ProjectWritingRoutesImplementation {
  constructor(
    protected readonly projectsService: ProjectsService,
    protected readonly fileStorageService: FileStorageService,
    protected readonly projectUsageService: ProjectUsageService,
    protected readonly projectAccessService: ProjectAccessService,
  ) {
    super();
  }
}
installInheritedMethods(ProjectsController, [
  'transformProject',
  'findMany',
  'getOne',
  'deleteOne',
  'archive',
  'unarchive',
  'create',
  'update',
  'getUsageHistory',
  'getUsageStats',
  'listMembers',
  'removeMember',
  'listInvitations',
  'createInvitation',
  'resendInvitation',
  'cancelInvitation',
]);
