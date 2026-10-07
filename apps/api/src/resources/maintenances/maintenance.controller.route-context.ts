import { ResourceMaintenanceService } from './maintenance.service';

export abstract class ResourceMaintenanceControllerRouteContext {
  protected abstract readonly maintenanceService: ResourceMaintenanceService;
}
