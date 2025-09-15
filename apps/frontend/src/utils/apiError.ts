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
  const errorMessage =
    ((props.error as ApiError).body as { message?: string | string[] } | undefined)?.message ?? props.error.message;

  const translationExists = props.tExists(props.baseTranslationKey + '.' + errorMessage);

  const fullBaseKey = translationExists
    ? props.baseTranslationKey + '.' + errorMessage
    : props.baseTranslationKey + '.' + (props.fallbackKey ?? 'generic');

  return { key: fullBaseKey, errorMessage };
}
