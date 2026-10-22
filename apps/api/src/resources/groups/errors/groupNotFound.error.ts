import { NotFoundException } from '@nestjs/common';

export class ResourceGroupNotFoundException extends NotFoundException {
  constructor(identifier: { id: number }) {
    super('ResourceGroupNotFound', {
      cause: `Resource group with identifier ${JSON.stringify(identifier)} not found`,
    });
  }
}
