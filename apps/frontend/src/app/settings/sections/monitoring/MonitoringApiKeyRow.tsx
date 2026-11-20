import { Alert, AlertContent, AlertDescription, InputGroup, TextField, Tooltip, TooltipContent } from '@heroui/react';
import { ClipboardCopyIcon, KeyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertStatusIcon, Button, ConfirmableButton, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useDeleteMetricsApiKey,
  useGenerateMetricsApiKey,
  UseGetMetricsSettingsKeyFn,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import { useCopyToClipboard } from '../../../../hooks/useCopyToClipboard';
import en from './en.json';
import de from './de.json';

interface MonitoringApiKeyRowProps {
  /** From the metrics settings the section loads; `undefined` while they are unknown. */
  apiKeyConfigured: boolean | undefined;
  /**
   * The key just generated, shown once. Held by the section, above its loading gate: Generate
   * invalidates the settings, and when they had failed to load that refetch shows the spinner and
   * unmounts this row — the key must still be there afterwards, it cannot be shown again.
   */
  generatedKey: string | null;
  setGeneratedKey: (key: string | null) => void;
}

export function MonitoringApiKeyRow({ apiKeyConfigured, generatedKey, setGeneratedKey }: MonitoringApiKeyRowProps) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const copyToClipboard = useCopyToClipboard({
    title: t('copyFailed.title'),
    description: t('copyFailed.description'),
  });

  const {
    mutate: generateApiKey,
    mutateAsync: rerollApiKey,
    isPending: isGenerating,
  } = useGenerateMetricsApiKey(undefined, {
    onSuccess(data) {
      setGeneratedKey((data as { apiKey: string }).apiKey);
      queryClient.invalidateQueries({ queryKey: UseGetMetricsSettingsKeyFn() });
      toast.success({ title: t('keyGenerated.title'), description: t('keyGenerated.description') });
    },
    onError: (error) => toast.error({ title: t('keyGenerateFailed'), description: (error as Error).message }),
  });

  const { mutateAsync: deleteApiKey, isPending: isDeleting } = useDeleteMetricsApiKey(undefined, {
    onSuccess() {
      setGeneratedKey(null);
      queryClient.invalidateQueries({ queryKey: UseGetMetricsSettingsKeyFn() });
      toast.success({ title: t('keyRemoved.title'), description: t('keyRemoved.description') });
    },
    onError: (error) => toast.error({ title: t('keyRemoveFailed'), description: (error as Error).message }),
  });

  return (
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
                    onPress={() =>
                      copyToClipboard(generatedKey, {
                        title: t('copied.title'),
                        description: t('copied.description'),
                      })
                    }
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
          {apiKeyConfigured ? (
            <>
              <ConfirmableButton
                label={t('rerollButton')}
                icon={<RefreshCwIcon size={16} />}
                status="warning"
                isPending={isGenerating}
                buttonProps={{ variant: 'primary', size: 'sm' }}
                confirm={{
                  title: t('confirmReroll.title'),
                  message: t('confirmReroll.description'),
                  confirmLabel: t('confirmReroll.confirm'),
                  cancelLabel: t('confirmReroll.cancel'),
                }}
                onConfirm={() => rerollApiKey()}
              />
              <ConfirmableButton
                label={t('removeButton')}
                icon={<Trash2Icon size={16} />}
                status="error"
                isPending={isDeleting}
                buttonProps={{ variant: 'danger-soft', size: 'sm' }}
                confirm={{
                  title: t('confirmRemove.title'),
                  message: t('confirmRemove.description'),
                  confirmLabel: t('confirmRemove.confirm'),
                  cancelLabel: t('confirmRemove.cancel'),
                }}
                onConfirm={() => deleteApiKey()}
              />
            </>
          ) : (
            <Button variant="primary" size="sm" isPending={isGenerating} onPress={() => generateApiKey()}>
              <KeyIcon size={16} />
              {t('generateButton')}
            </Button>
          )}
        </div>
      )}
    </SettingsRow>
  );
}
