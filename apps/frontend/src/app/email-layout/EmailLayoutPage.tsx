import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { ArrowLeft, Palette, RotateCcw } from 'lucide-react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Button } from '../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAppTheme } from '@attraccess/ui';
import { useToastMessage } from '../../components/toastProvider';
import { StandardDrawer } from '../../components/standardDrawer';
import { StandardModal } from '../../components/standardModal';
import { MjmlVisualEditor } from '../email-templates/edit/MjmlVisualEditor';
import { CONTENT_PLACEHOLDER, splitHead } from '../email-templates/edit/mjmlLayout';
import {
  useEmailLayoutServiceEmailLayoutControllerFindGlobal,
  useEmailLayoutServiceEmailLayoutControllerUpdate,
  useEmailLayoutServiceEmailLayoutControllerResetToDefault as useResetLayoutToDefault,
} from '@attraccess/react-query-client';

import en from './en.json';
import de from './de.json';

const PLACEHOLDER_CLASS = 'layout-content-placeholder';

// The stored layout is a full <mjml> document with a raw {{content}} token in
// mj-body. GrapesJS would drop that bare text node, so for editing we swap it
// for a locked, visibly-marked section and swap back on save. The mj-head is
// split off too (GrapesJS has no mj-attributes component) and carried through
// verbatim; MjmlVisualEditor injects it into the canvas so styles still render.
const placeholderSection = (label: string) =>
  `<mj-section css-class="${PLACEHOLDER_CLASS}" background-color="#F1F5F9" border="2px dashed #94A3B8">` +
  `<mj-column><mj-text align="center" color="#64748B" font-size="14px">${label}</mj-text></mj-column>` +
  `</mj-section>`;

const toEditable = (body: string, label: string) => body.replace(CONTENT_PLACEHOLDER, () => placeholderSection(label));

const toStorable = (editedDoc: string, head: string) =>
  editedDoc
    .replace(
      new RegExp(`<mj-section[^>]*css-class="[^"]*${PLACEHOLDER_CLASS}[^"]*"[\\s\\S]*?</mj-section>`),
      () => CONTENT_PLACEHOLDER,
    )
    // Tolerate attributes on the root tag (<mjml owa="desktop" lang="de">…) —
    // a literal '<mjml>' match would silently drop the head for such layouts.
    .replace(/<mjml([^>]*)>/, (_match, attrs) => `<mjml${attrs}>${head}`);

export function EmailLayoutPage() {
  const navigate = useNavigate();
  const basePath = '/settings/email';
  const { t, language } = useTranslations({ en, de });
  const { resolvedTheme } = useAppTheme();
  const toast = useToastMessage();

  const layout = useEmailLayoutServiceEmailLayoutControllerFindGlobal();

  // Same uncontrolled-canvas setup as the template editor: the canvas reads its
  // initial value once per seed and reports edits into a ref, so typing never
  // re-renders the page. Reseed (first load, reset, style changes) via editorSeed.
  const headRef = useRef('');
  const docRef = useRef<string | null>(null);
  const [editorSeed, setEditorSeed] = useState(0);

  const seedFromStored = useCallback(
    (storedBody: string) => {
      const { head, body } = splitHead(storedBody);
      headRef.current = head;
      docRef.current = toEditable(body, t('placeholder.canvasLabel'));
      setEditorSeed((seed) => seed + 1);
    },
    [t],
  );

  useEffect(() => {
    if (layout.data && docRef.current === null) {
      seedFromStored(layout.data.body);
    }
  }, [layout.data, seedFromStored]);

  const handleDocChange = useCallback((mjml: string) => {
    docRef.current = mjml;
  }, []);

  const updateLayout = useEmailLayoutServiceEmailLayoutControllerUpdate();
  const onSave = useCallback(() => {
    const body = toStorable(docRef.current ?? '', headRef.current);
    if (!body.includes(CONTENT_PLACEHOLDER)) {
      toast.error({ title: t('toast.missingPlaceholder') });
      return;
    }
    updateLayout.mutate(
      { requestBody: { body } },
      {
        onSuccess: () => toast.success({ title: t('toast.saveSuccess') }),
        onError: (error) => {
          const responseBody = (error as { body?: { message?: string | string[] } })?.body;
          const message = Array.isArray(responseBody?.message) ? responseBody?.message[0] : responseBody?.message;
          toast.error({ title: t('toast.saveError'), description: message });
        },
      },
    );
  }, [updateLayout, toast, t]);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetLayout = useResetLayoutToDefault();
  const onResetConfirm = useCallback(() => {
    resetLayout.mutate(undefined, {
      onSuccess: (data) => {
        seedFromStored(data.body);
        setResetConfirmOpen(false);
        toast.success({ title: t('toast.resetSuccess') });
      },
      onError: () => toast.error({ title: t('toast.resetError') }),
    });
  }, [resetLayout, seedFromStored, toast, t]);

  // The mj-head (global fonts/colors via mj-attributes, mj-style) has no visual
  // representation in the canvas, so it stays editable as code in a drawer.
  const [stylesOpen, setStylesOpen] = useState(false);
  const [headDraft, setHeadDraft] = useState('');
  const openStyles = useCallback(() => {
    setHeadDraft(headRef.current);
    setStylesOpen(true);
  }, []);
  const applyStyles = useCallback(() => {
    headRef.current = headDraft;
    setEditorSeed((seed) => seed + 1);
    setStylesOpen(false);
  }, [headDraft]);

  const handleMonacoMount = useCallback<OnMount>((editor, monaco) => {
    if (!monaco.languages.getLanguages().some((l) => l.id === 'mjml')) {
      monaco.languages.register({ id: 'mjml', extensions: ['.mjml'], aliases: ['MJML', 'mjml'] });
    }
    const model = editor.getModel();
    if (model && model.getLanguageId() !== 'mjml') {
      monaco.editor.setModelLanguage(model, 'mjml');
    }
  }, []);

  return (
    <div className="h-full flex flex-col gap-3" data-cy="email-layout-page">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={() => navigate(basePath)}
          aria-label={t('actions.back')}
          data-cy="email-layout-back-button"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex flex-col min-w-0">
          <h1 className="text-base font-semibold whitespace-nowrap">{t('title')}</h1>
          <p className="text-xs text-default-500 truncate hidden sm:block">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="sm" onPress={openStyles} data-cy="email-layout-styles-button">
            <Palette size={16} />
            <span className="hidden sm:inline">{t('actions.styles')}</span>
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => setResetConfirmOpen(true)}
            aria-label={t('actions.resetToDefault')}
            data-cy="email-layout-reset-button"
          >
            <RotateCcw size={16} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={onSave}
            isPending={updateLayout.isPending}
            data-cy="email-layout-save-button"
          >
            {t('actions.save')}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-default-200">
        {layout.isError && docRef.current === null ? (
          <div className="h-full flex flex-col items-center justify-center gap-3" data-cy="email-layout-load-error">
            <p className="text-sm text-danger">{t('error.loadFailed')}</p>
            <Button variant="ghost" size="sm" onPress={() => layout.refetch()}>
              {t('error.retry')}
            </Button>
          </div>
        ) : docRef.current === null || editorSeed === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : (
          <MjmlVisualEditor
            key={`${editorSeed}-${language}`}
            initialValue={docRef.current}
            onChange={handleDocChange}
            language={language}
            headMjml={headRef.current}
            lockClass={PLACEHOLDER_CLASS}
            exportFullDocument
          />
        )}
      </div>

      <StandardDrawer isOpen={stylesOpen} onOpenChange={setStylesOpen} dialogProps={{ className: 'md:max-w-4xl' }}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('styles.title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <div className="flex flex-col gap-3 h-full">
            <p className="text-sm text-default-500">{t('styles.description')}</p>
            <div className="h-[300px] md:h-[60vh]">
              <Editor
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs-light'}
                defaultLanguage="mjml"
                value={headDraft}
                onChange={(v) => setHeadDraft(v ?? '')}
                onMount={handleMonacoMount}
              />
            </div>
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={() => setStylesOpen(false)}>
            {t('actions.cancel')}
          </Button>
          <Button variant="primary" onPress={applyStyles} data-cy="email-layout-styles-apply-button">
            {t('actions.apply')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>

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
    </div>
  );
}

export default EmailLayoutPage;
