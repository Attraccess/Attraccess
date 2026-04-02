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
  Tooltip,
  useDisclosure,
} from '@heroui/react';
import { AlertTriangleIcon, ClipboardCopyIcon, KeyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useSettingsServiceGetMetricsSettings,
  UseSettingsServiceGetMetricsSettingsKeyFn,
  useSettingsServiceGenerateMetricsApiKey,
  useSettingsServiceDeleteMetricsApiKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

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

  const prometheusSnippet = useMemo(() => {
    const host = window.location.host;
    return `scrape_configs:
  - job_name: 'attraccess'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['${host}']
    bearer_token: '<YOUR_API_KEY>'`;
  }, []);

  const queryParamExample = useMemo(() => `${metricsEndpointUrl}?api_key=<YOUR_API_KEY>`, [metricsEndpointUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

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

      <p className="text-sm text-default-500">{t('setupGuide.queryParamNote')}</p>
      <CodeBlock>{queryParamExample}</CodeBlock>

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
