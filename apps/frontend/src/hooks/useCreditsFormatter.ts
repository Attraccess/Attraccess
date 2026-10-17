import { useCallback } from 'react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { formatCredits } from '@attraccess/shared';

export function useCreditsFormatter(minorUnit: number) {
  const { language } = useTranslationState();
  return useCallback(
    (credits: number | bigint) => formatCredits(credits, minorUnit, { locale: language }),
    [language, minorUnit],
  );
}
