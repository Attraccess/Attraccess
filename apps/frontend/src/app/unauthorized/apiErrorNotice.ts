import type { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import type { ApiError } from '@attraccess/react-query-client';
import { getTranslationKeyForApiError } from '../../utils/apiError';
import { getRetryAfterSeconds } from '../../utils/retryAfterSeconds';

export interface ApiErrorNotice {
  title: string;
  description: string;
}

/** Translates an API error with the `api` translations (including the rate-limit message). */
export function toApiErrorNotice(error: unknown, t: TFunction, tExists: TExists): ApiErrorNotice {
  const { key } = getTranslationKeyForApiError({
    error: error as ApiError,
    t,
    tExists,
    baseTranslationKey: 'api',
    fallbackKey: 'generic',
  });
  const data = { error, retryAfterSeconds: getRetryAfterSeconds(error as ApiError) };
  return { title: t(key + '.title', data), description: t(key + '.description', data) };
}
