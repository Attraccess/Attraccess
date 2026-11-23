import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { ApiError } from '@attraccess/react-query-client';

export interface Props {
  error: ApiError | Error;
  t: TFunction;
  tExists: TExists;
  baseTranslationKey: string;
  fallbackKey?: string;
}

/** The server's error message (NestJS `body.message`), falling back to the transport error message. */
export function getApiErrorMessage(error: ApiError | Error): string {
  return String(((error as ApiError).body as { message?: string | string[] } | undefined)?.message ?? error.message);
}

/** The machine-readable `code` some server errors carry next to their message. */
export function getApiErrorCode(error: ApiError | Error): string | undefined {
  const code = ((error as ApiError).body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function getTranslationKeyForApiError(props: Props) {
  let errorMessage = getApiErrorMessage(props.error);

  // A coded error (e.g. SESSION_DURATION_ESTIMATE_REQUIRED) is translated by its code, not its English message.
  const code = getApiErrorCode(props.error);
  if (code && props.tExists(props.baseTranslationKey + '.' + code, { succeedIfKeyIsObject: true })) {
    return { key: props.baseTranslationKey + '.' + code, errorMessage };
  }

  // Initialization wraps setup errors; retain their actionable configuration guidance.
  errorMessage = errorMessage.replace(/^METER_INITIALIZATION_FAILED: (?=METER_NOT_CONFIGURED: )/, '');

  let errorMessageTranslationKey = errorMessage;

  let fullKey = props.baseTranslationKey + '.' + errorMessageTranslationKey;

  const prefixed =
    /^(FLOW_EXECUTION_ERROR|METER_NOT_CONFIGURED|METER_INITIALIZATION_FAILED|METER_SETTLEMENT_FAILED|METER_SHARING_UNSUPPORTED): ([\s\S]*)$/.exec(
      errorMessage,
    );
  if (prefixed) {
    errorMessageTranslationKey = prefixed[1];
    errorMessage = prefixed[2];

    fullKey = props.baseTranslationKey + '.' + errorMessageTranslationKey;
  }

  const translationExists = props.tExists(fullKey, { succeedIfKeyIsObject: true });

  const fullBaseKey = translationExists
    ? props.baseTranslationKey + '.' + errorMessageTranslationKey
    : props.baseTranslationKey + '.' + (props.fallbackKey ?? 'generic');

  return { key: fullBaseKey, errorMessage };
}
