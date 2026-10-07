import { useCallback, useMemo, useState } from 'react';
import { useOverlayState } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useSettingsServiceDeleteMetricsApiKey,
  useSettingsServiceGenerateMetricsApiKey,
  useSettingsServiceGetMetricsSettings,
  UseSettingsServiceGetMetricsSettingsKeyFn,
  useSettingsServiceUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';
import { ToggleKey } from './index.toggle-key';

export function useMonitoringSectionState() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<ToggleKey | null>(null);
  // `undefined` means "untouched in this session"; the displayed value then falls back to the
  // server's. Seeding this from an effect instead left the NumberField without a value for the
  // first commit after loading finished, painting the field empty for a frame, and let a background
  // refetch clobber edits the operator had not saved yet.
  const [thresholdDraft, setThresholdDraft] = useState<number | undefined>(undefined);

  const rerollModal = useOverlayState();
  const removeModal = useOverlayState();

  // Same query/mutation contract as the old MetricsSettingsForm — only the presentation changed.
  const { data: metricsSettings, isLoading } = useSettingsServiceGetMetricsSettings();

  const savedThreshold = metricsSettings?.slowQueryThresholdSeconds;
  // NaN is React Aria's representation of an empty NumberField, so it keeps the field controlled
  // even when there is nothing to show.
  const threshold = thresholdDraft ?? savedThreshold ?? NaN;

  const metricsEndpointUrl = useMemo(() => `${window.location.origin}/api/metrics`, []);
  const prometheusSnippet = useMemo(
    () => `scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['${window.location.host}']
    bearer_token: '<YOUR_API_KEY>'`,
    [],
  );

  const { mutate: generateApiKey, isPending: isGenerating } = useSettingsServiceGenerateMetricsApiKey({
    onSuccess(data) {
      setGeneratedKey((data as { apiKey: string }).apiKey);
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({ title: t('keyGenerated.title'), description: t('keyGenerated.description') });
      rerollModal.close();
    },
  });

  const { mutate: deleteApiKey, isPending: isDeleting } = useSettingsServiceDeleteMetricsApiKey({
    onSuccess() {
      setGeneratedKey(null);
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({ title: t('keyRemoved.title'), description: t('keyRemoved.description') });
      removeModal.close();
    },
  });

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

  const copyToClipboard = useCallback(
    async (text: string, successTitle: string, successDescription: string) => {
      if (!navigator?.clipboard?.writeText) {
        toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        toast.success({ title: successTitle, description: successDescription });
      } catch {
        toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
      }
    },
    [toast, t],
  );

  const isThresholdSavable = Number.isFinite(threshold) && threshold >= 0;
  // Clearing the field yields NaN, which is still a departure from the saved value: the bar has to
  // stay mounted because Discard is the only way back to it. It just must not be committable.
  const isThresholdDirty = isThresholdSavable ? threshold !== savedThreshold : savedThreshold !== undefined;
  return {
    t,
    generatedKey,
    setGeneratedKey,
    pendingToggle,
    setPendingToggle,
    setThresholdDraft,
    rerollModal,
    removeModal,
    metricsSettings,
    isLoading,
    threshold,
    metricsEndpointUrl,
    prometheusSnippet,
    generateApiKey,
    isGenerating,
    deleteApiKey,
    isDeleting,
    updateToggle,
    isUpdatingToggles,
    updateThreshold,
    isSavingThreshold,
    copyToClipboard,
    isThresholdSavable,
    isThresholdDirty,
  } as const;
}
