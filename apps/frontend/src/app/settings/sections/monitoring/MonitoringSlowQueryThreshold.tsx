import {
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useSettingsServiceGetMetricsSettings,
  UseSettingsServiceGetMetricsSettingsKeyFn,
  useSettingsServiceUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

/** The slow-query threshold row and its save bar; `children` render above the row, inside the same column. */
export function MonitoringSlowQueryThreshold({ children }: { children?: ReactNode }) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: metricsSettings } = useSettingsServiceGetMetricsSettings();
  // `undefined` means "untouched in this session"; the displayed value then falls back to the
  // server's. Seeding this from an effect instead left the NumberField without a value for the
  // first commit after loading finished, painting the field empty for a frame, and let a background
  // refetch clobber edits the operator had not saved yet.
  const [thresholdDraft, setThresholdDraft] = useState<number | undefined>(undefined);

  const savedThreshold = metricsSettings?.slowQueryThresholdSeconds;
  // NaN is React Aria's representation of an empty NumberField, so it keeps the field controlled
  // even when there is nothing to show.
  const threshold = thresholdDraft ?? savedThreshold ?? NaN;

  const { mutate: updateThreshold, isPending: isSavingThreshold } = useSettingsServiceUpdateMetricsSettings({
    onSuccess(data) {
      // Release the draft pin, or `threshold` would ignore the server for the lifetime of this
      // mount: a later change by someone else then shows a phantom "unsaved changes" bar holding a
      // stale value, whose Save silently reverts them.
      //
      // Priming the cache from the response rather than invalidating and releasing is what keeps
      // that release from flashing the pre-save value for a frame — PATCH returns the full
      // MetricsSettingsDto, so this is the authoritative post-write state and also covers the
      // server normalising what we sent (with the pin held, a normalised value would leave the bar
      // stuck dirty forever).
      queryClient.setQueryData(UseSettingsServiceGetMetricsSettingsKeyFn(), data);
      setThresholdDraft(undefined);
      toast.success({
        title: t('slowQueryThreshold.savedTitle'),
        description: t('slowQueryThreshold.savedDescription'),
      });
    },
    onError() {
      toast.error({ title: t('slowQueryThreshold.errorTitle'), description: t('slowQueryThreshold.errorDescription') });
    },
  });

  const isThresholdSavable = Number.isFinite(threshold) && threshold >= 0;
  // Clearing the field yields NaN, which is still a departure from the saved value: the bar has to
  // stay mounted because Discard is the only way back to it. It just must not be committable.
  const isThresholdDirty = isThresholdSavable ? threshold !== savedThreshold : savedThreshold !== undefined;

  return (
    <>
      <div className="flex flex-col">
        {children}
        <SettingsRow label={t('slowQueryThreshold.title')} hint={t('slowQueryThreshold.description')}>
          <NumberField
            value={threshold}
            onChange={setThresholdDraft}
            minValue={0}
            step={0.1}
            aria-label={t('slowQueryThreshold.label')}
          >
            <NumberFieldGroup>
              <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
              <NumberFieldInput />
              <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
            </NumberFieldGroup>
          </NumberField>
        </SettingsRow>
      </div>

      <SettingsSaveBar
        isDirty={isThresholdDirty}
        isSaving={isSavingThreshold}
        isSaveDisabled={!isThresholdSavable}
        onSave={() => {
          if (!isThresholdSavable) {
            return;
          }
          updateThreshold({ requestBody: { slowQueryThresholdSeconds: threshold } });
        }}
        onDiscard={() => setThresholdDraft(undefined)}
      />
    </>
  );
}
