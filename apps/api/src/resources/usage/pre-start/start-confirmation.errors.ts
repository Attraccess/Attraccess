import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { PluginBlockReason } from '@attraccess/plugins-backend-sdk';

export interface StartConfirmationBody {
  title: string;
  body: string;
  tone?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  countdownToMs?: number;
  expiresAtMs: number;
}

/** 409: a plugin wants an explicit confirmation. Retry with `confirmedStepIds: [stepId]`. */
export class StartConfirmationRequiredException extends ConflictException {
  constructor(stepId: string, confirmation: StartConfirmationBody) {
    super({
      statusCode: 409,
      error: 'Conflict',
      message: 'A confirmation is required to start this session',
      code: 'CONFIRMATION_REQUIRED',
      stepId,
      confirmation,
    });
  }
}

/** 403: a plugin refused the start; the reason is shown to the user as written. */
export class StartBlockedException extends ForbiddenException {
  constructor(reason: PluginBlockReason) {
    super({ statusCode: 403, error: 'Forbidden', message: reason.title, code: 'START_BLOCKED', reason });
  }
}
