import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  useSettingsServiceGetSystemSettings,
  useSettingsServiceUpdateSystemSettings,
  useSettingsServiceGetSystemSettingsKey,
} from '@attraccess/react-query-client';
import { Button, Form, Input, Spinner, Switch } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

export function AiSettingsForm() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [enabled, setEnabled] = useState(false);
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [maxContextChunks, setMaxContextChunks] = useState('5');

  const { data: settings, isLoading } = useSettingsServiceGetSystemSettings();

  useEffect(() => {
    if (!settings?.ai) return;
    setEnabled(settings.ai.enabled);
    setOllamaBaseUrl(settings.ai.ollamaBaseUrl ?? '');
    setChatModel(settings.ai.chatModel ?? '');
    setEmbedModel(settings.ai.embedModel ?? '');
    setMaxContextChunks(settings.ai.maxContextChunks != null ? String(settings.ai.maxContextChunks) : '5');
  }, [settings]);

  const mutateConfig = useMemo(() => ({
    onSuccess() {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      queryClient.invalidateQueries({ queryKey: [useSettingsServiceGetSystemSettingsKey] });
    },
    onError(error: Error) {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  }), [t, tExists, toast, queryClient]);

  const { mutate: saveSettings, isPending } = useSettingsServiceUpdateSystemSettings(mutateConfig);

  const handleSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) return;

    saveSettings({
      requestBody: {
        ai: {
          enabled,
          ollamaBaseUrl: ollamaBaseUrl.trim() || undefined,
          chatModel: chatModel.trim() || undefined,
          embedModel: embedModel.trim() || undefined,
          maxContextChunks: maxContextChunks ? Number(maxContextChunks) : undefined,
        },
      },
    });
  }, [enabled, ollamaBaseUrl, chatModel, embedModel, maxContextChunks, saveSettings]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

  return (
    <Form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <Switch isSelected={enabled} onValueChange={setEnabled}>
        {t('inputs.enabled.label')}
      </Switch>
      <Input
        label={t('inputs.ollamaBaseUrl.label')}
        description={t('inputs.ollamaBaseUrl.description')}
        value={ollamaBaseUrl}
        onValueChange={setOllamaBaseUrl}
        placeholder="http://localhost:11434"
      />
      <Input
        label={t('inputs.chatModel.label')}
        description={t('inputs.chatModel.description')}
        value={chatModel}
        onValueChange={setChatModel}
        placeholder="llama3.2"
      />
      <Input
        label={t('inputs.embedModel.label')}
        description={t('inputs.embedModel.description')}
        value={embedModel}
        onValueChange={setEmbedModel}
        placeholder="nomic-embed-text"
      />
      <Input
        label={t('inputs.maxContextChunks.label')}
        description={t('inputs.maxContextChunks.description')}
        type="number"
        value={maxContextChunks}
        onValueChange={setMaxContextChunks}
        min={1}
      />
      <Button color="primary" onPress={handleSubmit} isLoading={isPending}>
        {t('actions.save')}
      </Button>
      <input type="submit" hidden />
    </Form>
  );
}
