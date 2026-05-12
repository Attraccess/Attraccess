import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Separator,
  Switch,
  TextField,
  Label,
  InputGroup,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  Tooltip,
  TooltipContent,
  useOverlayState,
} from '@heroui/react';
import { AlertTriangleIcon, ClipboardCopyIcon, KeyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MetricsTogglesDto,
  useSettingsServiceGetMetricsSettings,
  UseSettingsServiceGetMetricsSettingsKeyFn,
  useSettingsServiceGenerateMetricsApiKey,
  useSettingsServiceDeleteMetricsApiKey,
  useSettingsServiceUpdateMetricsSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type ToggleKey = keyof MetricsTogglesDto;

const TOGGLE_ORDER: ToggleKey[] = ['http', 'ws', 'cron', 'db', 'external', 'sse', 'flow'];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-default-100 dark:bg-default-50 rounded-lg p-3 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre">
      {children}
    </pre>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description ? <p className="text-sm text-default-500">{description}</p> : null}
    </div>
  );
}

export function MetricsSettingsForm() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<ToggleKey | null>(null);
  const [thresholdInput, setThresholdInput] = useState<number | undefined>(undefined);

  const { data: metricsSettings, isLoading } = useSettingsServiceGetMetricsSettings();

  const rerollModal = useOverlayState();
  const removeModal = useOverlayState();

  const metricsEndpointUrl = useMemo(() => `${window.location.origin}/api/metrics`, []);

  const { mutate: generateApiKey, isPending: isGenerating } = useSettingsServiceGenerateMetricsApiKey({
    onSuccess(data) {
      setGeneratedKey((data as { apiKey: string }).apiKey);
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({
        title: t('keyGenerated.title'),
        description: t('keyGenerated.description'),
      });
      rerollModal.close();
    },
  });

  const { mutate: deleteApiKey, isPending: isDeleting } = useSettingsServiceDeleteMetricsApiKey({
    onSuccess() {
      setGeneratedKey(null);
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({
        title: t('keyRemoved.title'),
        description: t('keyRemoved.description'),
      });
      removeModal.close();
    },
  });

  const { mutate: updateMetricsSettings, isPending: isUpdatingToggles } = useSettingsServiceUpdateMetricsSettings({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({
        title: t('toggles.savedTitle'),
        description: t('toggles.savedDescription'),
      });
      setPendingToggle(null);
    },
    onError() {
      toast.error({
        title: t('toggles.errorTitle'),
        description: t('toggles.errorDescription'),
      });
      setPendingToggle(null);
    },
  });

  const { mutate: updateThreshold, isPending: isSavingThreshold } = useSettingsServiceUpdateMetricsSettings({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({
        title: t('slowQueryThreshold.savedTitle'),
        description: t('slowQueryThreshold.savedDescription'),
      });
    },
    onError() {
      toast.error({
        title: t('slowQueryThreshold.errorTitle'),
        description: t('slowQueryThreshold.errorDescription'),
      });
    },
  });

  const handleCopyText = useCallback(
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

  const handleCopyKey = useCallback(async () => {
    if (!generatedKey) return;
    await handleCopyText(generatedKey, t('copied.title'), t('copied.description'));
  }, [generatedKey, handleCopyText, t]);

  const handleCopyEndpoint = useCallback(async () => {
    await handleCopyText(metricsEndpointUrl, t('endpointCopied.title'), t('endpointCopied.description'));
  }, [metricsEndpointUrl, handleCopyText, t]);

  const handleGenerate = useCallback(() => {
    if (metricsSettings?.apiKeyConfigured) {
      rerollModal.open();
    } else {
      generateApiKey();
    }
  }, [metricsSettings?.apiKeyConfigured, rerollModal, generateApiKey]);

  const handleToggleChange = useCallback(
    (subsystem: ToggleKey, value: boolean) => {
      setPendingToggle(subsystem);
      updateMetricsSettings({ requestBody: { toggles: { [subsystem]: value } } });
    },
    [updateMetricsSettings],
  );

  const handleSaveThreshold = useCallback(() => {
    if (thresholdInput === undefined || Number.isNaN(thresholdInput) || thresholdInput < 0) return;
    updateThreshold({ requestBody: { slowQueryThresholdSeconds: thresholdInput } });
  }, [thresholdInput, updateThreshold]);

  const prometheusSnippet = useMemo(() => {
    const host = window.location.host;
    return `scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['${host}']
    bearer_token: '<YOUR_API_KEY>'`;
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  const togglesSection = metricsSettings?.toggles ? (
    <div className="flex flex-col gap-3">
      <Separator />
      <SectionHeading title={t('toggles.title')} description={t('toggles.description')} />
      <div className="flex flex-col gap-2">
        {TOGGLE_ORDER.map((subsystem) => (
          <Switch
            key={subsystem}
            data-testid={`metrics-toggle-${subsystem}`}
            isSelected={metricsSettings.toggles[subsystem]}
            onChange={(value) => handleToggleChange(subsystem, value)}
            isDisabled={isUpdatingToggles && pendingToggle !== null}
            className="inline-flex flex-row-reverse items-start justify-between max-w-full w-full"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {t(`toggles.${subsystem}.label`)}
                {subsystem === 'db' && (
                  <Chip size="sm" color="warning">
                    {t('toggles.highCostBadge')}
                  </Chip>
                )}
              </div>
              <p className="text-xs text-default-500">{t(`toggles.${subsystem}.description`)}</p>
            </div>
          </Switch>
        ))}
      </div>
    </div>
  ) : null;

  const thresholdSection = metricsSettings ? (
    <div className="flex flex-col gap-3">
      <Separator />
      <SectionHeading title={t('slowQueryThreshold.title')} description={t('slowQueryThreshold.description')} />
      <NumberField
        value={thresholdInput}
        onChange={setThresholdInput}
        minValue={0}
        step={0.1}
        aria-label={t('slowQueryThreshold.label')}
      >
        <Label>{t('slowQueryThreshold.label')}</Label>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
          <Button
            variant="primary"
            size="sm"
            onPress={handleSaveThreshold}
            isPending={isSavingThreshold}
            isDisabled={
              thresholdInput === undefined ||
              Number.isNaN(thresholdInput) ||
              thresholdInput < 0 ||
              thresholdInput === metricsSettings.slowQueryThresholdSeconds
            }
          >
            {t('slowQueryThreshold.saveButton')}
          </Button>
        </NumberFieldGroup>
      </NumberField>
    </div>
  ) : null;

  const endpointSection = (
    <TextField value={metricsEndpointUrl} isReadOnly>
      <Label>{t('endpointLabel')}</Label>
      <InputGroup>
        <InputGroup.Input className="font-mono text-sm" />
        <InputGroup.Suffix>
          <Tooltip>
            <Button variant="ghost" isIconOnly onPress={handleCopyEndpoint} aria-label={t('copyButton')}>
              <ClipboardCopyIcon size={16} />
            </Button>
            <TooltipContent>{t('copyButton')}</TooltipContent>
          </Tooltip>
        </InputGroup.Suffix>
      </InputGroup>
    </TextField>
  );

  const setupGuideSection = (
    <div className="flex flex-col gap-3">
      <Separator />
      <h4 className="text-sm font-semibold">{t('setupGuide.title')}</h4>
      <p className="text-sm text-default-500">{t('setupGuide.description')}</p>
      <CodeBlock>{prometheusSnippet}</CodeBlock>
      <p className="text-xs text-default-400">{t('setupGuide.bearerNote')}</p>

      <Separator />
      <h4 className="text-sm font-semibold">{t('setupGuide.grafanaTitle')}</h4>
      <p className="text-sm text-default-500">{t('setupGuide.grafanaDescription')}</p>
    </div>
  );

  if (generatedKey) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-warning-600 dark:text-warning-400">
          <AlertTriangleIcon size={16} />
          {t('warning')}
        </div>

        <TextField value={generatedKey} isReadOnly>
          <Label>{t('apiKeyLabel')}</Label>
          <InputGroup>
            <InputGroup.Input className="font-mono text-sm" />
            <InputGroup.Suffix>
              <Tooltip>
                <Button variant="ghost" isIconOnly onPress={handleCopyKey} aria-label={t('copyButton')}>
                  <ClipboardCopyIcon size={16} />
                </Button>
                <TooltipContent>{t('copyButton')}</TooltipContent>
              </Tooltip>
            </InputGroup.Suffix>
          </InputGroup>
        </TextField>

        {endpointSection}
        {setupGuideSection}
        {togglesSection}
        {thresholdSection}

        <div className="flex gap-2">
          <Button variant="secondary" onPress={() => setGeneratedKey(null)}>
            {t('doneButton')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-default-500">{t('description')}</p>

      {endpointSection}

      <div className="flex gap-2 flex-wrap">
        <Button variant="primary" onPress={handleGenerate} isPending={isGenerating}>
          metricsSettings?.apiKeyConfigured ? <RefreshCwIcon size={16} /> : <KeyIcon size={16} />
          {metricsSettings?.apiKeyConfigured ? t('rerollButton') : t('generateButton')}
        </Button>

        {metricsSettings?.apiKeyConfigured && (
          <Button variant="danger-soft" onPress={removeModal.open}>
            <Trash2Icon size={16} />
            {t('removeButton')}
          </Button>
        )}
      </div>

      {metricsSettings?.apiKeyConfigured && setupGuideSection}
      {togglesSection}
      {thresholdSection}

      <Modal
        isOpen={rerollModal.isOpen}
        onOpenChange={(o) => {
          if (!o) rerollModal.close();
        }}
      >
        <ModalBackdrop>
          <ModalContainer>
            <ModalDialog>
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
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>

      <Modal
        isOpen={removeModal.isOpen}
        onOpenChange={(o) => {
          if (!o) removeModal.close();
        }}
      >
        <ModalBackdrop>
          <ModalContainer>
            <ModalDialog>
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
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}
