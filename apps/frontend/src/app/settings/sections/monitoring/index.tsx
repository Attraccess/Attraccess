import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Chip,
  InputGroup,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  NumberField,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldDecrementButton,
  NumberFieldInput,
  Spinner,
  TextField,
  Tooltip,
  TooltipContent,
  useOverlayState,
} from '@heroui/react';
import { ClipboardCopyIcon, KeyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MetricsTogglesDto,
  useSettingsServiceDeleteMetricsApiKey,
  useSettingsServiceGenerateMetricsApiKey,
  useSettingsServiceGetMetricsSettings,
  UseSettingsServiceGetMetricsSettingsKeyFn,
  useSettingsServiceUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type ToggleKey = keyof MetricsTogglesDto;

const TOGGLE_ORDER: ToggleKey[] = ['http', 'ws', 'cron', 'db', 'external', 'sse', 'flow'];

export function MonitoringSection() {
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
      toast.success({ title: t('slowQueryThreshold.savedTitle'), description: t('slowQueryThreshold.savedDescription') });
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  const aside = (
    <>
      <TextField value={metricsEndpointUrl} isReadOnly>
        <Label>{t('endpointLabel')}</Label>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button
                variant="ghost"
                isIconOnly
                aria-label={t('copyButton')}
                onPress={() => copyToClipboard(metricsEndpointUrl, t('endpointCopied.title'), t('endpointCopied.description'))}
              >
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('setupGuide.title')}</h3>
        <p className="text-xs text-muted">{t('setupGuide.description')}</p>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-surface p-3 font-mono text-xs leading-relaxed">
          {prometheusSnippet}
        </pre>
        <p className="text-xs text-muted">{t('setupGuide.bearerNote')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('setupGuide.grafanaTitle')}</h3>
        <p className="text-xs text-muted">{t('setupGuide.grafanaDescription')}</p>
      </div>
    </>
  );

  return (
    <SettingsSection title={t('title')} description={t('sectionDescription')} aside={aside}>
      <div className="flex flex-col">
        <SettingsRow stacked={!!generatedKey} label={t('apiKeyLabel')} hint={t('description')}>
          {generatedKey ? (
            <div className="flex w-full flex-col gap-2">
              {/* HeroUI's own warning surface, not `text-warning-600` — v2's numbered colour
                  scales compile to nothing under v3 (ATT-858). */}
              <Alert status="warning">
                <AlertStatusIcon status="warning" />
                <AlertContent>
                  <AlertDescription>{t('warning')}</AlertDescription>
                </AlertContent>
              </Alert>
              <TextField value={generatedKey} isReadOnly aria-label={t('apiKeyLabel')}>
                <InputGroup>
                  <InputGroup.Input className="font-mono text-sm" />
                  <InputGroup.Suffix>
                    <Tooltip>
                      <Button
                        variant="ghost"
                        isIconOnly
                        aria-label={t('copyButton')}
                        onPress={() => copyToClipboard(generatedKey, t('copied.title'), t('copied.description'))}
                      >
                        <ClipboardCopyIcon size={16} />
                      </Button>
                      <TooltipContent>{t('copyButton')}</TooltipContent>
                    </Tooltip>
                  </InputGroup.Suffix>
                </InputGroup>
              </TextField>
              <Button variant="secondary" size="sm" onPress={() => setGeneratedKey(null)}>
                {t('doneButton')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                isPending={isGenerating}
                onPress={() => (metricsSettings?.apiKeyConfigured ? rerollModal.open() : generateApiKey())}
              >
                {metricsSettings?.apiKeyConfigured ? <RefreshCwIcon size={16} /> : <KeyIcon size={16} />}
                {metricsSettings?.apiKeyConfigured ? t('rerollButton') : t('generateButton')}
              </Button>
              {metricsSettings?.apiKeyConfigured && (
                <Button variant="danger-soft" size="sm" onPress={removeModal.open}>
                  <Trash2Icon size={16} />
                  {t('removeButton')}
                </Button>
              )}
            </div>
          )}
        </SettingsRow>

        {metricsSettings?.toggles &&
          TOGGLE_ORDER.map((subsystem) => (
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
                isSelected={metricsSettings.toggles[subsystem]}
                isDisabled={isUpdatingToggles && pendingToggle !== null}
                onChange={(value) => {
                  setPendingToggle(subsystem);
                  updateToggle({ requestBody: { toggles: { [subsystem]: value } } });
                }}
              />
            </SettingsRow>
          ))}

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

      <StandardModal isOpen={rerollModal.isOpen} onOpenChange={(open) => !open && rerollModal.close()} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmReroll.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmReroll.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('confirmReroll.cancel')}
              </Button>
              <Button variant="tertiary" onPress={() => generateApiKey()} isPending={isGenerating}>
                {t('confirmReroll.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <StandardModal isOpen={removeModal.isOpen} onOpenChange={(open) => !open && removeModal.close()} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmRemove.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmRemove.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('confirmRemove.cancel')}
              </Button>
              <Button variant="danger" onPress={() => deleteApiKey()} isPending={isDeleting}>
                {t('confirmRemove.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </SettingsSection>
  );
}

export default MonitoringSection;
