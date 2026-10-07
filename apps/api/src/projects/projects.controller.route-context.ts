import { FileStorageService } from '../common/services/file-storage.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectUsageService } from './project-usage.service';
import { ProjectsService } from './projects.service';

export abstract class ProjectsControllerRouteContext {
  protected abstract readonly projectAccessService: ProjectAccessService;
  protected abstract readonly projectsService: ProjectsService;
  protected abstract readonly fileStorageService: FileStorageService;
  protected abstract readonly projectUsageService: ProjectUsageService;
}
