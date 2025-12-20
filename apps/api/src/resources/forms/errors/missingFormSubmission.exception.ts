import { BadRequestException } from '@nestjs/common';

export class MissingFormSubmissionException extends BadRequestException {
  constructor(formName: string) {
    super('MissingFormSubmissionException', `Form "${formName}" must be submitted before proceeding.`);
  }
}
