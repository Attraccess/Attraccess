import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { PreflightCheckResultDto } from '@attraccess/react-query-client';
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import de from './de.json';
import en from './en.json';

/** The preflight checks with their result and the value the reader reported. */
export function PreflightList(props: Readonly<{ checks: readonly PreflightCheckResultDto[] }>) {
  const { t } = useTranslations({ de, en });
  return (
    <ul className="flex flex-col gap-1 text-sm" data-cy="secure-conversion-preflight">
      {props.checks.map((check) => (
        <li key={check.check} className="flex items-center gap-2" data-cy={`secure-conversion-check-${check.check}`}>
          {check.ok ? (
            <CheckCircle2Icon size={16} className="text-success" aria-label="ok" />
          ) : (
            <XCircleIcon size={16} className="text-danger" aria-label="failed" />
          )}
          <span className="flex-1">{t(`check.${check.check}`)}</span>
          {check.value && <span className="text-muted">{check.value}</span>}
        </li>
      ))}
    </ul>
  );
}
