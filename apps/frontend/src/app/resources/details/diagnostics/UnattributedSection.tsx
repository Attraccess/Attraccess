import { Card, Chip, Spinner } from '@heroui/react';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FlatSection } from '../../../../components/flatSection';
import { Select } from '../../../../components/select/index';
import { useOperatingDuration } from '../../operatingDuration';
import type { DiagnosticsRange } from './diagnosticsRange';
import { formatDuration } from './formatDuration';
import en from './en.json';
import de from './de.json';

const RANGE_OPTIONS = [
  { key: '7', labelKey: 'unattributed.ranges.7' },
  { key: '30', labelKey: 'unattributed.ranges.30' },
  { key: '90', labelKey: 'unattributed.ranges.90' },
] as const;

interface UnattributedSectionProps {
  resourceId: number;
  range: DiagnosticsRange;
  rangeDays: string;
  onRangeDaysChange: (days: string) => void;
}

/** Operating time split into attributed and unattributed for the selected range, with the range picker. */
export function UnattributedSection({
  resourceId,
  range,
  rangeDays,
  onRangeDaysChange,
}: Readonly<UnattributedSectionProps>) {
  const { t } = useTranslations({ en, de });
  // Unattributed summary rides the shared operating-attribution endpoint (ATT-1025/ATT-1027) —
  // the single derivation path — instead of a diagnostics-only duplicate.
  const { data: unattributed, isLoading: isLoadingUnattributed } = useOperatingDuration(resourceId, true, {
    start: range.start,
    end: range.end,
  });

  // The shared attribution summary reports operating and unattributed; attributed is the remainder.
  const attributedMs =
    unattributed &&
    unattributed.operatingDataAvailable &&
    unattributed.operatingDurationMs !== null &&
    unattributed.unattributedOperatingDurationMs !== null
      ? unattributed.operatingDurationMs - unattributed.unattributedOperatingDurationMs
      : null;

  return (
    <FlatSection
      icon={<ShieldCheckIcon className="w-4 h-4" />}
      title={t('unattributed.title')}
      actions={
        <Select
          aria-label={t('unattributed.rangeLabel')}
          className="w-44"
          value={rangeDays}
          onChange={(key) => {
            onRangeDaysChange(key);
          }}
          items={RANGE_OPTIONS.map((option) => ({ key: option.key, label: t(option.labelKey) }))}
          data-cy="diagnostics-range-select"
        />
      }
    >
      {isLoadingUnattributed ? (
        <Spinner size="sm" />
      ) : !unattributed?.operatingDataAvailable ? (
        <p className="text-sm text-muted" data-testid="diagnostics-unattributed-unavailable">
          {t('unattributed.noData')}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <Card variant="secondary" className="min-w-36 p-3">
            <p className="text-xs text-muted">{t('unattributed.operating')}</p>
            <p className="text-lg font-semibold" data-testid="diagnostics-operating-duration">
              {formatDuration(unattributed.operatingDurationMs, t('unattributed.unavailable'))}
            </p>
          </Card>
          <Card variant="secondary" className="min-w-36 p-3">
            <p className="text-xs text-muted">{t('unattributed.attributed')}</p>
            <p className="text-lg font-semibold" data-testid="diagnostics-attributed-duration">
              {formatDuration(attributedMs, t('unattributed.unavailable'))}
            </p>
          </Card>
          <Card variant="secondary" className="min-w-36 p-3">
            <p className="text-xs text-muted">{t('unattributed.unattributed')}</p>
            <p className="text-lg font-semibold" data-testid="diagnostics-unattributed-duration">
              {formatDuration(unattributed.unattributedOperatingDurationMs, t('unattributed.unavailable'))}
            </p>
          </Card>
          {unattributed.isProvisional && (
            <Chip size="sm" color="warning">
              {t('unattributed.provisional')}
            </Chip>
          )}
        </div>
      )}
    </FlatSection>
  );
}
