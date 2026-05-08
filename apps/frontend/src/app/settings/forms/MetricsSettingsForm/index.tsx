import { useCallback, useMemo, useState } from 'react';
import { Modal, ModalContent, useDisclosure } from '../../../../utils/heroui-compat';
import { Button, Divider, Input, ModalBody, ModalFooter, ModalHeader, Spinner, Tooltip } from '@heroui/react';
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

  useEffect(() => {
    if (metricsSettings?.slowQueryThresholdSeconds !== undefined) {
      setThresholdInput(metricsSettings.slowQueryThresholdSeconds);
    }
  }, [metricsSettings?.slowQueryThresholdSeconds]);

  const rerollModal = useDisclosure();
  const removeModal = useDisclosure();

  const metricsEndpointUrl = useMemo(() => `${window.location.origin}/api/metrics`, []);

  const { mutate: generateApiKey, isPending: isGenerating } = useSettingsServiceGenerateMetricsApiKey({
    onSuccess(data) {
      setGeneratedKey((data as { apiKey: string }).apiKey);
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMetricsSettingsKeyFn() });
      toast.success({
        title: t('keyGenerated.title'),
        description: t('keyGenerated.description'),
      });
      rerollModal.onClose();
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
      removeModal.onClose();
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

  const handleCopyText = useCallback(async (text: string, successTitle: string, successDescription: string) => {
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
  }, [toast, t]);

  const handleCopyKey = useCallback(async () => {
    if (!generatedKey) return;
    await handleCopyText(generatedKey, t('copied.title'), t('copied.description'));
  }, [generatedKey, handleCopyText, t]);

  const handleCopyEndpoint = useCallback(async () => {
    await handleCopyText(metricsEndpointUrl, t('endpointCopied.title'), t('endpointCopied.description'));
  }, [metricsEndpointUrl, handleCopyText, t]);

  const handleGenerate = useCallback(() => {
    if (metricsSettings?.apiKeyConfigured) {
      rerollModal.onOpen();
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
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

  const togglesSection = metricsSettings?.toggles ? (
    <div className="flex flex-col gap-3">
      <Divider />
      <SectionHeading title={t('toggles.title')} description={t('toggles.description')} />
      <div className="flex flex-col gap-2">
        {TOGGLE_ORDER.map((subsystem) => (
          <Switch
            key={subsystem}
            data-testid={`metrics-toggle-${subsystem}`}
            isSelected={metricsSettings.toggles[subsystem]}
            onValueChange={(value) => handleToggleChange(subsystem, value)}
            isDisabled={isUpdatingToggles && pendingToggle !== null}
            classNames={{ base: 'inline-flex flex-row-reverse items-start justify-between max-w-full w-full' }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {t(`toggles.${subsystem}.label`)}
                {subsystem === 'db' && (
                  <Chip size="sm" color="warning" variant="flat">
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
      <Divider />
      <SectionHeading title={t('slowQueryThreshold.title')} description={t('slowQueryThreshold.description')} />
      <NumberInput
        label={t('slowQueryThreshold.label')}
        value={thresholdInput}
        onValueChange={setThresholdInput}
        minValue={0}
        step={0.1}
        variant="bordered"
        endContent={
          <Button
            size="sm"
            color="primary"
            variant="flat"
            onPress={handleSaveThreshold}
            isLoading={isSavingThreshold}
            isDisabled={
              thresholdInput === undefined ||
              Number.isNaN(thresholdInput) ||
              thresholdInput < 0 ||
              thresholdInput === metricsSettings.slowQueryThresholdSeconds
            }
          >
            {t('slowQueryThreshold.saveButton')}
          </Button>
        }
      />
    </div>
  ) : null;

  const endpointSection = (
    <Input
      label={t('endpointLabel')}
      value={metricsEndpointUrl}
      isReadOnly
      variant="bordered"
      classNames={{ input: 'font-mono text-sm' }}
      endContent={
        <Tooltip content={t('copyButton')}>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={handleCopyEndpoint}
            aria-label={t('copyButton')}
          >
            <ClipboardCopyIcon size={16} />
          </Button>
        </Tooltip>
      }
    />
  );

  const setupGuideSection = (
    <div className="flex flex-col gap-3">
      <Divider />
      <h4 className="text-sm font-semibold">{t('setupGuide.title')}</h4>
      <p className="text-sm text-default-500">{t('setupGuide.description')}</p>
      <CodeBlock>{prometheusSnippet}</CodeBlock>
      <p className="text-xs text-default-400">{t('setupGuide.bearerNote')}</p>

      <Divider />
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

        <Input
          label={t('apiKeyLabel')}
          value={generatedKey}
          isReadOnly
          variant="bordered"
          classNames={{ input: 'font-mono text-sm' }}
          endContent={
            <Tooltip content={t('copyButton')}>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={handleCopyKey}
                aria-label={t('copyButton')}
              >
                <ClipboardCopyIcon size={16} />
              </Button>
            </Tooltip>
          }
        />

        {endpointSection}
        {setupGuideSection}
        {togglesSection}
        {thresholdSection}

        <div className="flex gap-2">
          <Button
            color="primary"
            variant="flat"
            onPress={() => setGeneratedKey(null)}
          >
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
        <Button
          color="primary"
          startContent={metricsSettings?.apiKeyConfigured ? <RefreshCwIcon size={16} /> : <KeyIcon size={16} />}
          onPress={handleGenerate}
          isLoading={isGenerating}
        >
          {metricsSettings?.apiKeyConfigured ? t('rerollButton') : t('generateButton')}
        </Button>

        {metricsSettings?.apiKeyConfigured && (
          <Button
            color="danger"
            variant="flat"
            startContent={<Trash2Icon size={16} />}
            onPress={removeModal.onOpen}
          >
            {t('removeButton')}
          </Button>
        )}
      </div>

      {metricsSettings?.apiKeyConfigured && setupGuideSection}
      {togglesSection}
      {thresholdSection}

      <Modal isOpen={rerollModal.isOpen} onClose={rerollModal.onClose}>
        <ModalContent>
          <ModalHeader>{t('confirmReroll.title')}</ModalHeader>
          <ModalBody>
            <p>{t('confirmReroll.description')}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={rerollModal.onClose}>
              {t('confirmReroll.cancel')}
            </Button>
            <Button color="warning" onPress={() => generateApiKey()} isLoading={isGenerating}>
              {t('confirmReroll.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={removeModal.isOpen} onClose={removeModal.onClose}>
        <ModalContent>
          <ModalHeader>{t('confirmRemove.title')}</ModalHeader>
          <ModalBody>
            <p>{t('confirmRemove.description')}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={removeModal.onClose}>
              {t('confirmRemove.cancel')}
            </Button>
            <Button color="danger" onPress={() => deleteApiKey()} isLoading={isDeleting}>
              {t('confirmRemove.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
