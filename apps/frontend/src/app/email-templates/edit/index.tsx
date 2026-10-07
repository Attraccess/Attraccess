import { EmailTemplateType } from '@attraccess/react-query-client';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { ArrowLeft, Braces, Languages, RotateCcw } from 'lucide-react';
import { buttonVariants } from '@heroui/styles';
import { Button } from '../../../components/button';
import { StandardDrawer } from '../../../components/standardDrawer';
import { StandardModal } from '../../../components/standardModal';
import { MjmlVisualEditor } from './MjmlVisualEditor';
import { TranslationsSection } from './TranslationsSection';
import { CHROME_CLASS } from './mjmlLayout';
import { useEditEmailTemplatePageState } from './useEditEmailTemplatePageState';

export function EditEmailTemplatePage() {
  const {
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
  } = useEditEmailTemplatePageState();

  return (
    <div className="h-full flex flex-col gap-3" data-cy="edit-email-template-page">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={() => navigate(`${basePath}/templates`)}
          aria-label={t('actions.back')}
          data-cy="edit-email-template-back-button"
        >
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-base font-semibold whitespace-nowrap">{t('templateType.' + templateType)}</h1>

        {/* Subject is edited (and translated) in the translations drawer; it still round-trips through save via `subject` state. */}
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
            key={`${editorSeed}-${language}`}
            initialValue={initialBodyRef.current}
            onChange={handleBodyChange}
            language={language}
            headMjml={headMjmlRef.current || undefined}
            lockClass={isWrappedRef.current ? CHROME_CLASS : undefined}
            exportFullDocument={isWrappedRef.current}
          />
        )}
      </div>

      <StandardDrawer
        isOpen={translationsOpen}
        onOpenChange={setTranslationsOpen}
        dialogProps={{ className: 'md:max-w-4xl' }}
      >
        <DrawerHeader>
          <DrawerHeading className="text-lg font-semibold">{t('sections.translations')}</DrawerHeading>
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
