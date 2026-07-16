import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerResetToDefault as useResetTemplateToDefault,
  EmailTemplateType,
} from '@attraccess/react-query-client';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Input,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  TextField,
} from '@heroui/react';
import { ArrowLeft, Braces, Languages, RotateCcw } from 'lucide-react';
import { buttonVariants } from '@heroui/styles';
import { Button } from '../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { StandardDrawer } from '../../../components/standardDrawer';
import { StandardModal } from '../../../components/standardModal';
import { MjmlVisualEditor } from './MjmlVisualEditor';
import { TranslationsSection } from './TranslationsSection';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';

export function EditEmailTemplatePage() {
  const navigate = useNavigate();
  const { t, language } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });
  const { type: templateType } = useParams<{ type: EmailTemplateType }>();
  const toast = useToastMessage();

  const template = useFindOneEmailTemplate({ type: templateType as EmailTemplateType }, undefined, {
    enabled: !!templateType,
  });

  // The GrapesJS canvas is uncontrolled: it reads its initial value once on
  // mount and reports edits into a ref, so typing never re-renders this page
  // and background refetches never clobber unsaved work. `editorSeed` only
  // changes when we deliberately want a fresh canvas (first load, reset).
  const [subject, setSubject] = useState('');
  const bodyRef = useRef('');
  const initialBodyRef = useRef<string | null>(null);
  const [editorSeed, setEditorSeed] = useState(0);

  useEffect(() => {
    if (template.data && initialBodyRef.current === null) {
      initialBodyRef.current = template.data.body;
      bodyRef.current = template.data.body;
      setSubject(template.data.subject);
      setEditorSeed((seed) => seed + 1);
    }
  }, [template.data]);

  const handleBodyChange = useCallback((mjml: string) => {
    bodyRef.current = mjml;
  }, []);

  const updateTemplate = useUpdateEmailTemplate();
  const onSave = useCallback(() => {
    if (!templateType) return;
    updateTemplate.mutate(
      { type: templateType, requestBody: { subject, body: bodyRef.current } },
      {
        onSuccess: () => toast.success({ title: t('toast.saveSuccess') }),
        onError: (error) => {
          const body = (error as { body?: { message?: string | string[] } })?.body;
          const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
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
          initialBodyRef.current = data.body;
          bodyRef.current = data.body;
          setSubject(data.subject);
          setEditorSeed((seed) => seed + 1);
          setResetConfirmOpen(false);
          toast.success({ title: t('toast.resetSuccess') });
        },
        onError: () => toast.error({ title: t('toast.resetError') }),
      },
    );
  }, [resetTemplate, templateType, toast, t]);

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
    setTranslationsContent(subject + '\n' + bodyRef.current);
    setTranslationsOpen(true);
  }, [subject]);

  return (
    <div className="h-full flex flex-col gap-3" data-cy="edit-email-template-page">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={() => navigate('/emails/templates')}
          aria-label={t('actions.back')}
          data-cy="edit-email-template-back-button"
        >
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-base font-semibold whitespace-nowrap">{t('templateType.' + templateType)}</h1>

        <TextField
          value={subject}
          onChange={setSubject}
          aria-label={t('form.subject')}
          className="flex-1 min-w-48 order-last md:order-none w-full md:w-auto"
        >
          <Input placeholder={t('form.subject')} data-cy="edit-email-template-subject-input" />
        </TextField>

        <div className="flex items-center gap-2 ml-auto">
          {variables.length > 0 && (
            <Dropdown>
              <DropdownTrigger
                className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} inline-flex items-center gap-2`}
                aria-label={t('variables.title')}
                data-cy="edit-email-template-variables-button"
              >
                <Braces size={16} />
                <span className="hidden sm:inline">{t('variables.title')}</span>
              </DropdownTrigger>
              <DropdownPopover>
                <DropdownMenu aria-label={t('variables.title')}>
                  {variables.map((name) => (
                    <DropdownItem key={name} id={name} onPress={() => copyVariable(name)}>
                      {`{{${name}}}`}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </DropdownPopover>
            </Dropdown>
          )}
          <Button
            variant="ghost"
            size="sm"
            onPress={openTranslations}
            data-cy="edit-email-template-translations-button"
          >
            <Languages size={16} />
            <span className="hidden sm:inline">{t('actions.translations')}</span>
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => setResetConfirmOpen(true)}
            aria-label={t('actions.resetToDefault')}
            data-cy="edit-email-template-reset-button"
          >
            <RotateCcw size={16} />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={onSave}
            isPending={updateTemplate.isPending}
            data-cy="edit-email-template-save-button"
          >
            {t('actions.save')}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-default-200">
        {initialBodyRef.current === null || editorSeed === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : (
          <MjmlVisualEditor
            key={editorSeed}
            initialValue={initialBodyRef.current}
            onChange={handleBodyChange}
            language={language}
          />
        )}
      </div>

      <StandardDrawer
        isOpen={translationsOpen}
        onOpenChange={setTranslationsOpen}
        dialogProps={{ className: 'md:max-w-4xl' }}
      >
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('sections.translations')}</h2>
        </DrawerHeader>
        <DrawerBody>
          {templateType && (
            <TranslationsSection templateType={templateType as EmailTemplateType} liveContent={translationsContent} />
          )}
        </DrawerBody>
        <DrawerFooter>
          <Button onPress={() => setTranslationsOpen(false)}>{t('actions.close')}</Button>
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
              <Button variant="danger" isPending={resetTemplate.isPending} onPress={onResetConfirm}>
                {t('resetConfirm.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </div>
  );
}

export default EditEmailTemplatePage;
