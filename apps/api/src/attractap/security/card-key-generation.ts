import { randomBytes } from 'crypto';

export interface CardKeyContext {
  installationId: string;
  cardId: string;
  applicationId: string;
  slot: number;
}

/** Generates future application keys; never rotates or activates a physical card. */
export function generateCardKey(context: CardKeyContext): Buffer {
  if (
    !context ||
    ![context.installationId, context.cardId, context.applicationId].every(
      (value) => typeof value === 'string' && value.trim().length > 0,
    ) ||
    !Number.isSafeInteger(context.slot) ||
    context.slot < 0 ||
    context.slot > 255
  ) {
    throw new Error('Complete card application and slot context is required');
  }
  return randomBytes(16);
}
