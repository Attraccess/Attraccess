import { ResourceUsageService } from './resourceUsage.service';

export abstract class ResourceUsageControllerRouteContext {
  protected abstract readonly resourceUsageService: ResourceUsageService;
}
