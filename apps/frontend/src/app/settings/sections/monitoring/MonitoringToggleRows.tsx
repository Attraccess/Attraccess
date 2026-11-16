import { Chip } from '@heroui/react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MetricsTogglesDto,
  UseSettingsServiceGetMetricsSettingsKeyFn,
  useSettingsServiceUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

const TOGGLE_ORDER: Array<keyof MetricsTogglesDto> = ['http', 'ws', 'cron', 'db', 'external', 'sse', 'flow'];

/** One switch per instrumented subsystem; `toggles` come from the metrics settings the section loads. */
export function MonitoringToggleRows({ toggles }: { toggles: MetricsTogglesDto | undefined }) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [pendingToggle, setPendingToggle] = useState<keyof MetricsTogglesDto | null>(null);

  const { mutate: updateToggle, isPending: isUpdatingToggles } = useSettingsServiceUpdateMetricsSettings({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({ title: t('toggles.savedTitle'), description: t('toggles.savedDescription') });
      setPendingToggle(null);
    },
    onError() {
      toast.error({ title: t('toggles.errorTitle'), description: t('toggles.errorDescription') });
      setPendingToggle(null);
    },
  });

  if (!toggles) return null;

  return (
    <>
      {TOGGLE_ORDER.map((subsystem) => (
        <SettingsRow
          key={subsystem}
          data-testid={`metrics-toggle-row-${subsystem}`}
          label={
            <span className="flex items-center gap-2">
              {t(`toggles.${subsystem}.label`)}
              {subsystem === 'db' && (
                <Chip size="sm" color="warning">
                  {t('toggles.highCostBadge')}
                </Chip>
              )}
            </span>
          }
          hint={t(`toggles.${subsystem}.description`)}
        >
          {/* The row owns the layout, so the switch no longer needs the old
                  `contentClassName="w-full items-start"` workaround to stay put. */}
          <LabeledSwitch
            data-testid={`metrics-toggle-${subsystem}`}
            aria-label={t(`toggles.${subsystem}.label`)}
            isSelected={toggles[subsystem]}
            isDisabled={isUpdatingToggles && pendingToggle !== null}
            onChange={(value) => {
              setPendingToggle(subsystem);
              updateToggle({ requestBody: { toggles: { [subsystem]: value } } });
            }}
          />
        </SettingsRow>
      ))}
    </>
  );
}
