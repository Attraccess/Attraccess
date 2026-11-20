import { Chip, Spinner } from '@heroui/react';
import { ActivityIcon } from 'lucide-react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourceOperatingDiagnosticsGetState } from '@attraccess/react-query-client';
import { FlatSection } from '../../../../components/flatSection';
import en from './en.json';
import de from './de.json';

/** Whether the machine is operating right now, since when, and the last state change. */
export function OperatingStateSection({ resourceId }: Readonly<{ resourceId: number }>) {
  const { t } = useTranslations({ en, de });
  const { data: state, isLoading: isLoadingState } = useResourceOperatingDiagnosticsGetState({ path: { resourceId } });
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
