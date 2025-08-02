import { BadRequestException } from '@nestjs/common';

export class ResourceUsageImpossibleMaintenanceInProgressException extends BadRequestException {
  constructor(resourceId: number) {
    super('ResourceMaintenanceInUseException', {
      description: `Resource with ID ${resourceId} is currently under maintenance and cannot be used at this time`,
    });
  }
}
