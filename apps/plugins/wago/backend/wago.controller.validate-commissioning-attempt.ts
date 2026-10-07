import { BadRequestException } from '@nestjs/common';
import type { CommissioningAttemptInput } from "./wago.controller.commissioning-attempt-input";

export function validateCommissioningAttempt(body: CommissioningAttemptInput, intent: 'installation' | 'recovery') {
  if (body?.confirmInstall !== true) throw new BadRequestException(`Explicit ${intent} consent is required`);
  if (
    typeof body.temporarySsh?.username !== 'string' ||
    !body.temporarySsh.username.trim() ||
    typeof body.temporarySsh.password !== 'string' ||
    !body.temporarySsh.password
  ) {
    throw new BadRequestException('Temporary SSH username and password are required');
  }
  return {
    confirmInstall: true as const,
    temporarySsh: { username: body.temporarySsh.username, password: body.temporarySsh.password },
  };
}
