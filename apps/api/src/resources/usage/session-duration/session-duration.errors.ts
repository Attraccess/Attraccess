import { BadRequestException } from '@nestjs/common';

/** Machine-readable codes of the session duration refusals (field `code` of the 400 body). */
export const SessionDurationErrorCode = {
  ESTIMATE_REQUIRED: 'SESSION_DURATION_ESTIMATE_REQUIRED',
  ESTIMATE_EXCEEDS_MAXIMUM: 'SESSION_DURATION_ESTIMATE_EXCEEDS_MAXIMUM',
  EXTENSION_EXCEEDS_MAXIMUM: 'SESSION_EXTENSION_EXCEEDS_MAXIMUM',
  EXTENSION_NOT_POSSIBLE: 'SESSION_EXTENSION_NOT_POSSIBLE',
  EXTENSION_INVALID: 'SESSION_EXTENSION_INVALID',
} as const;

export type SessionDurationErrorCodeValue = (typeof SessionDurationErrorCode)[keyof typeof SessionDurationErrorCode];

function refusal(code: SessionDurationErrorCodeValue, message: string, extra: Record<string, unknown> = {}) {
  return { statusCode: 400, error: 'Bad Request', message, code, ...extra };
}

/** 400: the machine requires a duration estimate and the start has none. Names the maximum, when there is one. */
export class SessionDurationEstimateRequiredException extends BadRequestException {
  constructor(maxSessionDurationMinutes: number | null) {
    super(
      refusal(SessionDurationErrorCode.ESTIMATE_REQUIRED, 'This machine requires an estimate of the session duration', {
        maxSessionDurationMinutes,
      }),
    );
  }
}

/** 400: the estimate is above the machine's maximum session time. */
export class SessionDurationEstimateExceedsMaximumException extends BadRequestException {
  constructor(estimatedDurationMinutes: number, maxSessionDurationMinutes: number) {
    super(
      refusal(
        SessionDurationErrorCode.ESTIMATE_EXCEEDS_MAXIMUM,
        `The estimated duration (${estimatedDurationMinutes} min) exceeds the maximum session time (${maxSessionDurationMinutes} min)`,
        { estimatedDurationMinutes, maxSessionDurationMinutes },
      ),
    );
  }
}

/** 400: the extension would take the session past its maximum (or the 30 day limit). Nothing is clipped. */
export class SessionExtensionExceedsMaximumException extends BadRequestException {
  constructor(maxAutoEndAt: Date) {
    super(
      refusal(
        SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
        'The extension would exceed the maximum session time',
        { maxAutoEndAt: maxAutoEndAt.toISOString() },
      ),
    );
  }
}

/** 400: the session has no deadline to move, or it has already passed. */
export class SessionExtensionNotPossibleException extends BadRequestException {
  constructor(message: string) {
    super(refusal(SessionDurationErrorCode.EXTENSION_NOT_POSSIBLE, message));
  }
}

/** 400: the request names neither a permitted step nor `toMax`. */
export class SessionExtensionInvalidException extends BadRequestException {
  constructor() {
    super(
      refusal(
        SessionDurationErrorCode.EXTENSION_INVALID,
        'Extend by 60, 120, 240, 360, 720 or 1440 minutes, or to the maximum',
      ),
    );
  }
}
