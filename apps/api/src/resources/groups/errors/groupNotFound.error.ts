import { NotFoundException } from '@nestjs/common';

export class ResourceGroupNotFoundException extends NotFoundException {
  constructor(identifier: Record<string, unknown>) {
    super('ResourceGroupNotFound', {
      cause: `Resource group with identifier ${JSON.stringify(identifier)} not found`,
    });
  }
}
