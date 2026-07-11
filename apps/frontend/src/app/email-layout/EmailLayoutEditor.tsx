import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Chip,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  Link,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  useTheme,
} from '@heroui/react';
import { Maximize, RotateCcw } from 'lucide-react';
import { Button } from '../../components/button';
import { useDebounce, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../components/toastProvider';
import { StandardDrawer } from '../../components/standardDrawer';
import { StandardModal } from '../../components/standardModal';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  useEmailLayoutServiceEmailLayoutControllerFindGlobal,
  useEmailLayoutServiceEmailLayoutControllerUpdate,
  useEmailLayoutServiceEmailLayoutControllerPreviewLayout,
  useEmailLayoutServiceEmailLayoutControllerResetToDefault as useResetLayoutToDefault,
} from '@attraccess/react-query-client';

import * as enFile from './en.json';
import * as deFile from './de.json';

const CONTENT_PLACEHOLDER = '{{content}}';

export function EmailLayoutEditor() {
  const { t } = useTranslations({ en: enFile, de: deFile });
  const { theme } = useTheme();
  const toast = useToastMessage();

  const { data: layout } = useEmailLayoutServiceEmailLayoutControllerFindGlobal();
  const updateLayout = useEmailLayoutServiceEmailLayoutControllerUpdate();
  const resetLayout = useResetLayoutToDefault();
  const {
    mutate: previewLayout,
    data: previewData,
    isPending: isPreviewPending,
    isError: isPreviewError,
    error: previewError,
  } = useEmailLayoutServiceEmailLayoutControllerPreviewLayout();

  const [body, setBody] = useState('');

  useEffect(() => {
    if (layout?.body) {
      setBody(layout.body);
    }
  }, [layout?.body]);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    if (!monaco.languages.getLanguages().some((l) => l.id === 'mjml')) {
      monaco.languages.register({ id: 'mjml', extensions: ['.mjml'], aliases: ['MJML', 'mjml'] });
    }
    const model = editor.getModel();
    if (model && model.getLanguageId() !== 'mjml') {
      monaco.editor.setModelLanguage(model, 'mjml');
    }
  }, []);

  const copyPlaceholder = useCallback(() => {
    navigator.clipboard.writeText(CONTENT_PLACEHOLDER).catch(() => undefined);
  }, []);

  const debouncedBody = useDebounce(body, 500);
  const bodyIsEmpty = !debouncedBody.trim();

  useEffect(() => {
    if (bodyIsEmpty) return;
    previewLayout({ requestBody: { body: debouncedBody } });
  }, [bodyIsEmpty, debouncedBody, previewLayout]);

  const previewHtml = useMemo(() => {
    if (bodyIsEmpty) {
      return `<p style="text-align:center;color:#64748b;padding-top:20px;">${t('preview.emptyPlaceholder')}</p>`;
    }
    if (isPreviewPending) {
      return `<p style="text-align:center;color:#00f;padding-top:20px;">${t('preview.loading')}</p>`;
    }
    if (previewData?.error) {
      return `<p style="text-align:center;color:#f00;padding-top:20px;">${previewData.error}</p>`;
    }
    if (isPreviewError) {
      const errorMessage = previewError instanceof Error ? previewError.message : String(previewError);
      return `<p style="text-align:center;color:#f00;padding-top:20px;">${t('preview.errorPrefix')} ${errorMessage}</p>`;
    }
    return previewData?.html ?? '';
  }, [bodyIsEmpty, previewData, isPreviewPending, isPreviewError, previewError, t]);

  const [editorIsExpanded, setEditorIsExpanded] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const hasPlaceholder = body.includes(CONTENT_PLACEHOLDER);

  const onResetConfirm = useCallback(() => {
    resetLayout.mutate(undefined, {
      onSuccess: (data) => {
        setBody(data.body);
        setResetConfirmOpen(false);
        toast.success({ title: t('toast.resetSuccess') });
      },
      onError: () => {
        toast.error({ title: t('toast.resetError') });
      },
    });
  }, [resetLayout, toast, t]);

  const editorContent = useMemo(
    () => (
      <>
        <div className="flex flex-col gap-2 p-3 bg-default-50 rounded-lg border border-default-200">
          <span className="text-xs font-semibold text-default-600 uppercase tracking-wide">
            {t('placeholder.hint')}
          </span>
          <span className="text-sm text-default-500">{t('placeholder.description')}</span>
          <div className="flex items-center gap-2">
            <Chip
              variant={hasPlaceholder ? 'soft' : 'secondary'}
              color={hasPlaceholder ? 'success' : 'warning'}
              className="cursor-pointer font-mono text-xs"
              onClick={copyPlaceholder}
            >
              {CONTENT_PLACEHOLDER}
            </Chip>
            {!hasPlaceholder && (
              <span className="text-xs text-warning-500">Missing from layout!</span>
            )}
          </div>
        </div>

        <div className="h-[300px] md:h-[60vh]">
          <Editor
            theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
            defaultLanguage="mjml"
            value={body}
            onChange={(v) => setBody(v ?? '')}
            onMount={handleEditorMount}
          />
        </div>
        <Link href="https://documentation.mjml.io/">{t('form.mjmlDocumentation')}</Link>
      </>
    ),
    [body, hasPlaceholder, theme, t, handleEditorMount, copyPlaceholder],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      updateLayout.mutate(
        { requestBody: { body } },
        {
          onSuccess: () => toast.success({ title: t('toast.saveSuccess') }),
          onError: () => toast.error({ title: t('toast.saveError') }),
        },
      );
    },
    [updateLayout, body, t, toast],
  );

  return (
    <Form onSubmit={onSubmit} className="gap-8">
      <div className="flex flex-col flex-wrap gap-8 w-full lg:flex-row lg:gap-6">
        <section className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
              {t('sections.editor')}
            </h3>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onPress={() => setEditorIsExpanded(true)}
              aria-label={t('actions.expand')}
            >
              <Maximize size={16} />
            </Button>
          </div>
          {editorContent}

          <StandardDrawer
            isOpen={editorIsExpanded}
            onOpenChange={setEditorIsExpanded}
            dialogProps={{ className: 'md:max-w-5xl' }}
          >
            <DrawerHeader>
              <h2 className="text-lg font-semibold">{t('title')}</h2>
            </DrawerHeader>
            <DrawerBody>
              <div className="flex flex-col gap-4 h-full min-h-[60vh]">{editorContent}</div>
            </DrawerBody>
            <DrawerFooter>
              <Button onPress={() => setEditorIsExpanded(false)}>{t('actions.close')}</Button>
            </DrawerFooter>
          </StandardDrawer>
        </section>

        <section className="flex-1 min-w-0 w-full flex flex-col gap-4">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
            {t('sections.preview')}
          </h3>
          <iframe
            srcDoc={previewHtml}
            title={t('preview.iframeTitle')}
            className="w-full h-full min-h-[435px] border-0 rounded-md bg-default-50"
            sandbox="allow-same-origin"
          />
        </section>
      </div>

      <div className="flex flex-row gap-4 w-full justify-end mt-4">
        <Button
          variant="ghost"
          type="button"
          onPress={() => setResetConfirmOpen(true)}
          data-cy="email-layout-reset-button"
        >
          <RotateCcw size={16} />
          {t('actions.resetToDefault')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          isPending={updateLayout.isPending}
          isDisabled={!hasPlaceholder}
        >
          {t('actions.save')}
        </Button>
      </div>

      <StandardModal isOpen={resetConfirmOpen} onOpenChange={setResetConfirmOpen} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('resetConfirm.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('resetConfirm.message')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('resetConfirm.cancel')}
              </Button>
              <Button variant="danger" isPending={resetLayout.isPending} onPress={onResetConfirm}>
                {t('resetConfirm.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </Form>
  );
}
