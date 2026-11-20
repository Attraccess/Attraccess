import { BadRequestException } from '@nestjs/common';

/** The user may not control the resource (no introduction, no permission). Answers like a plain 400. */
export class ResourceIntroductionRequiredException extends BadRequestException {
  constructor() {
    super('You must complete the resource introduction before using it');
  }
}
