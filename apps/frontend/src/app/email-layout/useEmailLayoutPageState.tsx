import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type OnMount } from '@monaco-editor/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAppTheme } from '@attraccess/ui';
import { useToastMessage } from '../../components/toastProvider';
import { CONTENT_PLACEHOLDER, splitHead } from '../email-templates/edit/mjmlLayout';
import {
  useEmailLayoutServiceEmailLayoutControllerFindGlobal,
  useEmailLayoutServiceEmailLayoutControllerUpdate,
  useEmailLayoutServiceEmailLayoutControllerResetToDefault as useResetLayoutToDefault,
} from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';
import { toEditable } from './EmailLayoutPage.state';
import { toStorable } from './EmailLayoutPage.state';
export function useEmailLayoutPageState() {
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
  return {
    navigate,
    basePath,
    t,
    language,
    resolvedTheme,
    layout,
    headRef,
    docRef,
    editorSeed,
    handleDocChange,
    updateLayout,
    onSave,
    resetConfirmOpen,
    setResetConfirmOpen,
    resetLayout,
    onResetConfirm,
    stylesOpen,
    setStylesOpen,
    headDraft,
    setHeadDraft,
    openStyles,
    applyStyles,
    handleMonacoMount,
  } as const;
}
