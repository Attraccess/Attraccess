import { formatDurationMs } from '@attraccess/shared';
import { Chip } from '@heroui/react';
import { Spinner } from '@heroui/react';
import { ActivityIcon } from 'lucide-react';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { OperatingStateDto } from '@attraccess/react-query-client';
import { FlatSection } from '../../../../components/flatSection';
import en from './en.json';
import de from './de.json';

export /** null means "operating data unavailable" (ATT-1027 semantics) — never render it as 0. */
function formatDuration(durationMs: number | null | undefined, unavailable: string): string {
  return durationMs === null || durationMs === undefined ? unavailable : formatDurationMs(durationMs);
}

export function OperatingStateSection({
  state,
  isLoadingState,
}: {
  state: OperatingStateDto | undefined;
  isLoadingState: boolean;
}) {
  const { t } = useTranslations({ en, de });
  return (
    <FlatSection icon={<ActivityIcon className="w-4 h-4" />} title={t('state.title')}>
      {isLoadingState ? (
        <Spinner size="sm" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Chip
            size="sm"
            color={state?.state === 'operating' ? 'success' : 'default'}
            data-testid="diagnostics-state-chip"
          >
            {state?.state === 'operating' ? t('state.operating') : t('state.idle')}
          </Chip>
          {state?.openInterval && (
            <span className="text-sm text-muted">
              {t('state.openSince')}: <DateTimeDisplay date={new Date(state.openInterval.startTime)} />
            </span>
          )}
          <span className="text-sm text-muted">
            {state?.lastTransitionAt ? (
              <>
                {t('state.lastTransition')}: <DateTimeDisplay date={new Date(state.lastTransitionAt)} />
              </>
            ) : (
              t('state.never')
            )}
          </span>
        </div>
      )}
    </FlatSection>
  );
}
export function rangeToBounds(days: string): { from: string; to: string; start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - Number(days) * 24 * 60 * 60_000);
  return { from: start.toISOString(), to: end.toISOString(), start, end };
}
