import { CornerDownRight } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface ContinuationLabelProps {
  /** Set on a usage record that continues a session after a project switch. */
  previousUsageId?: number | null;
  className?: string;
}

/** Marks a history row as the continuation of an earlier one: the same session under another project. */
export function ContinuationLabel({ previousUsageId, className = '' }: Readonly<ContinuationLabelProps>) {
  const { t } = useTranslations({ en, de });
  if (!previousUsageId) return null;
  return (
    <span className={`flex items-start gap-1 text-xs text-muted ${className}`} data-cy="usage-continuation">
      <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
      {t('continuedFrom', { id: previousUsageId })}
    </span>
  );
}
