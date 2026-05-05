import { BadRequestException } from '@nestjs/common';

export class ResourceUnhealthyException extends BadRequestException {
  constructor(resourceId: number) {
    super('ResourceUnhealthyException', {
      description: `Resource with ID ${resourceId} is currently reporting an unhealthy state and cannot be used at this time`,
    });
  }
}
