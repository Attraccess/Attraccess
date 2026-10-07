import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerResetToDefault as useResetTemplateToDefault,
  useEmailLayoutServiceEmailLayoutControllerFindGlobal as useFindGlobalEmailLayout,
  EmailTemplateType,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { extractTemplateFragment, splitHead, wrapInLayoutChrome } from './mjmlLayout';
import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';
export function useEditEmailTemplatePageState() {
  const navigate = useNavigate();
  const basePath = '/settings/email';
  const { t, language } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });
  const { type: templateType } = useParams<{ type: EmailTemplateType }>();
  const toast = useToastMessage();

  const template = useFindOneEmailTemplate({ type: templateType as EmailTemplateType }, undefined, {
    enabled: !!templateType,
  });
  const layout = useFindGlobalEmailLayout();

  // The GrapesJS canvas is uncontrolled: it reads its initial value once on
  // mount and reports edits into a ref, so typing never re-renders this page
  // and background refetches never clobber unsaved work. `editorSeed` only
  // changes when we deliberately want a fresh canvas (first load, reset).
  //
  // The canvas shows the template wrapped in the global layout: the layout's
  // chrome (header/footer) is rendered locked around the editable content and
  // stripped again on save; the layout's mj-head is injected into the canvas
  // rendering so global styles apply. If the layout is unavailable or shaped
  // unexpectedly, the editor falls back to plain fragment editing.
  const [subject, setSubject] = useState('');
  const bodyRef = useRef('');
  const initialBodyRef = useRef<string | null>(null);
  const headMjmlRef = useRef('');
  const isWrappedRef = useRef(false);
  const layoutBodyRef = useRef('');
  const [editorSeed, setEditorSeed] = useState(0);

  const seedEditor = useCallback((fragment: string) => {
    const { head, body: layoutBody } = splitHead(layoutBodyRef.current);
    const wrapped = layoutBody ? wrapInLayoutChrome(layoutBody, fragment) : null;
    headMjmlRef.current = wrapped ? head : '';
    isWrappedRef.current = wrapped !== null;
    initialBodyRef.current = wrapped ?? fragment;
    bodyRef.current = wrapped ?? fragment;
    setEditorSeed((seed) => seed + 1);
  }, []);

  const layoutSettled = layout.isSuccess || layout.isError;
  useEffect(() => {
    if (template.data && layoutSettled && initialBodyRef.current === null) {
      layoutBodyRef.current = layout.data?.body ?? '';
      setSubject(template.data.subject);
      seedEditor(template.data.body);
    }
  }, [template.data, layoutSettled, layout.data, seedEditor]);

  const handleBodyChange = useCallback((mjml: string) => {
    bodyRef.current = mjml;
  }, []);

  const updateTemplate = useUpdateEmailTemplate();
  const onSave = useCallback(() => {
    if (!templateType) return;
    const body = isWrappedRef.current ? extractTemplateFragment(bodyRef.current) : bodyRef.current;
    if (body === null) {
      toast.error({ title: t('toast.saveError'), description: t('toast.extractError') });
      return;
    }
    updateTemplate.mutate(
      { type: templateType, requestBody: { subject, body } },
      {
        onSuccess: () => toast.success({ title: t('toast.saveSuccess') }),
        onError: (error) => {
          const responseBody = (error as { body?: { message?: string | string[] } })?.body;
          const message = Array.isArray(responseBody?.message) ? responseBody?.message[0] : responseBody?.message;
          toast.error({ title: t('toast.saveError'), description: message });
        },
      },
    );
  }, [updateTemplate, subject, templateType, toast, t]);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetTemplate = useResetTemplateToDefault();
  const onResetConfirm = useCallback(() => {
    if (!templateType) return;
    resetTemplate.mutate(
      { type: templateType },
      {
        onSuccess: (data) => {
          setSubject(data.subject);
          seedEditor(data.body);
          setResetConfirmOpen(false);
          toast.success({ title: t('toast.resetSuccess') });
        },
        onError: () => toast.error({ title: t('toast.resetError') }),
      },
    );
  }, [resetTemplate, templateType, seedEditor, toast, t]);

  const variables = template.data?.variables ?? [];
  const copyVariable = useCallback(
    (name: string) => {
      const token = `{{${name}}}`;
      navigator.clipboard.writeText(token).then(
        () => toast.success({ title: t('variables.copied', { name: token }) }),
        () => toast.error({ title: t('variables.copyFailed', { name: token }) }),
      );
    },
    [t, toast],
  );

  // Snapshot taken when the drawer opens; extracting {{t}} keys on every
  // canvas edit would force the page re-renders the ref setup exists to avoid.
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const [translationsContent, setTranslationsContent] = useState('');
  const openTranslations = useCallback(() => {
    const body = (isWrappedRef.current ? extractTemplateFragment(bodyRef.current) : null) ?? bodyRef.current;
    setTranslationsContent(subject + '\n' + body);
    setTranslationsOpen(true);
  }, [subject]);
  return {
    navigate,
    basePath,
    t,
    language,
    templateType,
    initialBodyRef,
    headMjmlRef,
    isWrappedRef,
    editorSeed,
    handleBodyChange,
    updateTemplate,
    onSave,
    resetConfirmOpen,
    setResetConfirmOpen,
    resetTemplate,
    onResetConfirm,
    variables,
    copyVariable,
    translationsOpen,
    setTranslationsOpen,
    translationsContent,
    openTranslations,
  } as const;
}
