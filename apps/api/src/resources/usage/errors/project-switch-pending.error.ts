import { ConflictException } from '@nestjs/common';

/** The session's project is being switched, so which record the change belongs to is not decided yet. */
export class ProjectSwitchPendingError extends ConflictException {
  constructor() {
    super('The project of this session is being switched. Please try again.');
  }
}
