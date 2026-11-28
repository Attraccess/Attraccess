import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LicenseService } from '../../../license/license.service';
import { CreateMaintenanceRequestDto } from '../../maintenances/dtos/create-maintenance-request.dto';
import { isMaintenanceLicensed } from '../../maintenances/maintenance-license';
import { MaintenanceRequestService } from '../../maintenances/maintenance-request.service';

/**
 * The maintenance request a user answers the "Is the machine OK?" check with. The web app and the readers send it
 * with the end of the session; it is filed only once that end succeeded, so call this after `endSession` returned.
 */
@Injectable()
export class SessionEndMaintenanceRequests {
  private readonly logger = new Logger(SessionEndMaintenanceRequests.name);

  constructor(
    private readonly requests: MaintenanceRequestService,
    private readonly license: LicenseService,
  ) {}

  /**
   * Files the request for the user who ended the session, exactly like one filed on the resource page. Never
   * throws, since the session is already over: `false` says it was not filed. `undefined` when none was asked for.
   */
  async fileAfterEnd(resourceId: number, userId: number, request: unknown): Promise<boolean | undefined> {
    if (request === undefined || request === null) return undefined;
    try {
      if (!(await isMaintenanceLicensed(this.license))) {
        this.logger.warn(`Maintenance request for resource ${resourceId} not filed: no maintenance license`);
        return false;
      }
      const dto = typeof request === 'object' ? plainToInstance(CreateMaintenanceRequestDto, request) : null;
      if (!dto || validateSync(dto).length > 0) {
        this.logger.warn(`Maintenance request for resource ${resourceId} not filed: invalid reason`);
        return false;
      }
      await this.requests.createRequest(resourceId, userId, dto.reason);
      return true;
    } catch (error) {
      this.logger.error(
        `Session on resource ${resourceId} ended, but the maintenance request could not be filed`,
        (error as Error).stack,
      );
      return false;
    }
  }
}
