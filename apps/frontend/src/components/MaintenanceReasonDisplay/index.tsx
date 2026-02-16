import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';

import de from './de.json';
import en from './en.json';

export interface MaintenanceReasonDisplayProps {
  /** Raw reason from API (plain text or JSON with i18nKey + details). */
  reason: string | null | undefined;
  /** Shown when reason is empty or unparseable. Defaults to translated "No reason". */
  fallback?: string;
}

/**
 * Renders a maintenance reason as translated text. Supports:
 * - JSON from schedule evaluator: { i18nKey, details } → translated message + optional schedule name
 * - Plain text (legacy or manual reasons) → shown as-is
 */
export function MaintenanceReasonDisplay({ reason, fallback }: MaintenanceReasonDisplayProps) {
  const formatted = useFormattedMaintenanceReason({ fallback })(reason);
  return formatted;
}

export interface UseFormattedMaintenanceReasonOptions {
  /** Used when reason is empty or unparseable. Defaults to translated "No reason". */
  fallback?: string;
}

/**
 * Returns a function that formats a maintenance reason for display (table cells, tooltips, etc.).
 * Use this when you need the string instead of a component (e.g. for title attribute or concatenation).
 */
export function useFormattedMaintenanceReason(options: UseFormattedMaintenanceReasonOptions = {}) {
  const { fallback } = options;
  const { t } = useTranslations({ en, de });

  return useMemo(
    () => (reason: string | null | undefined): string => {
      if (reason == null || reason === '') return fallback ?? t('reason.noReason');
      try {
        const parsed = JSON.parse(reason) as { i18nKey?: string; details?: Record<string, number | string> };
        if (parsed?.i18nKey && typeof parsed.details === 'object') {
          return t(parsed.i18nKey, parsed.details as Record<string, string | number>);
        }
      } catch {
        // not JSON or legacy reason
      }
      return reason;
    },
    [t, fallback]
  );
}
