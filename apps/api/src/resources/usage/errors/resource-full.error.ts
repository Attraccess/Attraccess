import { BadRequestException } from '@nestjs/common';

export class ResourceFullError extends BadRequestException {
  constructor(
    public readonly activeSessionCount: number,
    public readonly maxParallelSessions: number,
  ) {
    super('ResourceFullError', {
      description: `This machine is full (${activeSessionCount}/${maxParallelSessions} sessions in use).`,
    });
  }
}
