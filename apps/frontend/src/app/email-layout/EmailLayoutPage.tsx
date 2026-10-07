import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
} from '@heroui/react';
import { ArrowLeft, Palette, RotateCcw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Button } from '../../components/button';
import { StandardDrawer } from '../../components/standardDrawer';
import { StandardModal } from '../../components/standardModal';
import { MjmlVisualEditor } from '../email-templates/edit/MjmlVisualEditor';
import { PLACEHOLDER_CLASS } from './EmailLayoutPage.state';
import { useEmailLayoutPageState } from './useEmailLayoutPageState';

// The stored layout is a full <mjml> document with a raw {{content}} token in
// mj-body. GrapesJS would drop that bare text node, so for editing we swap it
// for a locked, visibly-marked section and swap back on save. The mj-head is
// split off too (GrapesJS has no mj-attributes component) and carried through
// verbatim; MjmlVisualEditor injects it into the canvas so styles still render.

export function EmailLayoutPage() {
  const {
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
  } = useEmailLayoutPageState();

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
          <DrawerHeading className="text-lg font-semibold">{t('styles.title')}</DrawerHeading>
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
