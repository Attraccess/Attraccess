import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import { ApiError } from '@attraccess/react-query-client';

export interface Props {
  error: ApiError | Error;
  t: TFunction;
  tExists: TExists;
  baseTranslationKey: string;
  fallbackKey?: string;
}

export function getTranslationKeyForApiError(props: Props) {
  let errorMessage = String(
    ((props.error as ApiError).body as { message?: string | string[] } | undefined)?.message ?? props.error.message,
  );

  // Initialization wraps setup errors; retain their actionable configuration guidance.
  errorMessage = errorMessage.replace(/^METER_INITIALIZATION_FAILED: (?=METER_NOT_CONFIGURED: )/, '');

  let errorMessageTranslationKey = errorMessage;

  let fullKey = props.baseTranslationKey + '.' + errorMessageTranslationKey;

  const prefixed =
    /^(FLOW_EXECUTION_ERROR|METER_NOT_CONFIGURED|METER_INITIALIZATION_FAILED|METER_SETTLEMENT_FAILED): ([\s\S]*)$/.exec(
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
