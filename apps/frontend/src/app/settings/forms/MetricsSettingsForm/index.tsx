import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Switch,
  Tooltip,
  useDisclosure,
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

export function MetricsSettingsForm() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<ToggleKey | null>(null);

  const { data: metricsSettings, isLoading } = useSettingsServiceGetMetricsSettings();

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
      <h4 className="text-sm font-semibold">{t('toggles.title')}</h4>
      <p className="text-sm text-default-500">{t('toggles.description')}</p>
      <div className="flex flex-col gap-3">
        {TOGGLE_ORDER.map((subsystem) => {
          const isHighCost = subsystem === 'db';
          const checked = metricsSettings.toggles[subsystem];
          return (
            <div
              key={subsystem}
              className={`flex items-start justify-between gap-4 rounded-medium border p-3 ${
                isHighCost
                  ? 'border-warning-300 bg-warning-50 dark:border-warning-600/40 dark:bg-warning-50/5'
                  : 'border-default-200 dark:border-default-100'
              }`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {t(`toggles.${subsystem}.label`)}
                  {isHighCost && (
                    <span className="rounded-full bg-warning-200 dark:bg-warning-700/40 text-warning-800 dark:text-warning-200 px-2 py-0.5 text-[10px] uppercase tracking-wide font-semibold">
                      {t('toggles.highCostBadge')}
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs ${
                    isHighCost ? 'text-warning-700 dark:text-warning-300' : 'text-default-500'
                  }`}
                >
                  {t(`toggles.${subsystem}.description`)}
                </p>
              </div>
              <Switch
                data-testid={`metrics-toggle-${subsystem}`}
                isSelected={checked}
                onValueChange={(value) => handleToggleChange(subsystem, value)}
                isDisabled={isUpdatingToggles && pendingToggle !== null}
                aria-label={t(`toggles.${subsystem}.label`)}
              />
            </div>
          );
        })}
      </div>
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
