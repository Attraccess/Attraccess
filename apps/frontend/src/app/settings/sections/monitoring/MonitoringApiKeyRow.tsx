import {
  Alert,
  AlertContent,
  AlertDescription,
  InputGroup,
  TextField,
  Tooltip,
  TooltipContent,
  useOverlayState,
} from '@heroui/react';
import { ClipboardCopyIcon, KeyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertStatusIcon, Button, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useSettingsServiceDeleteMetricsApiKey,
  useSettingsServiceGenerateMetricsApiKey,
  useSettingsServiceGetMetricsSettings,
  UseSettingsServiceGetMetricsSettingsKeyFn,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import { useCopyToClipboard } from './useCopyToClipboard';
import en from './en.json';
import de from './de.json';

export function MonitoringApiKeyRow() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const copyToClipboard = useCopyToClipboard();
  const { data: metricsSettings } = useSettingsServiceGetMetricsSettings();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const rerollModal = useOverlayState();
  const removeModal = useOverlayState();

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

  return (
    <>
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

      <StatusDialog
        isOpen={rerollModal.isOpen}
        onClose={rerollModal.close}
        status="warning"
        title={t('confirmReroll.title')}
        closeLabel={t('confirmReroll.cancel')}
        action={{ label: t('confirmReroll.confirm'), onPress: () => generateApiKey(), isPending: isGenerating }}
      >
        {t('confirmReroll.description')}
      </StatusDialog>

      <StatusDialog
        isOpen={removeModal.isOpen}
        onClose={removeModal.close}
        status="error"
        title={t('confirmRemove.title')}
        closeLabel={t('confirmRemove.cancel')}
        action={{ label: t('confirmRemove.confirm'), onPress: () => deleteApiKey(), isPending: isDeleting }}
      >
        {t('confirmRemove.description')}
      </StatusDialog>
    </>
  );
}
