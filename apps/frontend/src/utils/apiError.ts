import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { ApiError } from '@attraccess/react-query-client';
import { NETWORK_RESTRICTED_ERROR_CODE } from '@attraccess/application-models';

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

/** A 403 for an action the user's network does not allow (the server's NETWORK_RESTRICTED error code). */
export function isNetworkRestrictedError(error: unknown): boolean {
  const body = (error as ApiError | undefined)?.body as { code?: string; message?: unknown } | undefined;
  return body?.code === NETWORK_RESTRICTED_ERROR_CODE || body?.message === NETWORK_RESTRICTED_ERROR_CODE;
}

export function getTranslationKeyForApiError(props: Props) {
  let errorMessage = getApiErrorMessage(props.error);

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
