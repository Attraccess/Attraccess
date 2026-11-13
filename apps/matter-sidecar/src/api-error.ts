import type { ErrorCode } from '@attraccess/matter-contract';

/** A refusal a handler wants to send to the client as it is. The message is shown to the operator: no secrets, no paths. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
