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

  let errorMessageTranslationKey = errorMessage;

  const fullKey = props.baseTranslationKey + '.' + errorMessageTranslationKey;
  let translationExists = props.tExists(fullKey);

  if (errorMessage.startsWith('FLOW_EXECUTION_ERROR: ')) {
    errorMessageTranslationKey = 'FLOW_EXECUTION_ERROR';
    errorMessage = errorMessage.replace('FLOW_EXECUTION_ERROR: ', '');

    translationExists = props.tExists(props.baseTranslationKey + '.' + errorMessageTranslationKey + '.title');
  }

  const fullBaseKey = translationExists
    ? props.baseTranslationKey + '.' + errorMessageTranslationKey
    : props.baseTranslationKey + '.' + (props.fallbackKey ?? 'generic');

  return { key: fullBaseKey, errorMessage };
}
