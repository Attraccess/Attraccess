import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { StandardModal } from '../../../components/standardModal';
import { Button } from '../../../components/button';
import type { useTranslationsSectionState } from './useTranslationsSectionState';
export function TranslationDeleteModal({ model }: { model: ReturnType<typeof useTranslationsSectionState> }) {
  return (
    <StandardModal
      isOpen={!!model.deleteTarget}
      onOpenChange={(open) => !open && model.setDeleteTarget(null)}
      size="sm"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>
              {model.t('translations.removeLanguage', {
                language: model.deleteTarget ? model.displayName(model.deleteTarget) : '',
              })}
            </ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p>
              {model.t('translations.deleteConfirm', {
                language: model.deleteTarget ? model.displayName(model.deleteTarget) : '',
              })}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close}>
              {model.t('actions.cancel')}
            </Button>
            <Button
              variant="danger"
              isPending={model.deleteMutation.isPending}
              onPress={model.handleDeleteConfirmed}
              data-cy="translations-remove-language-confirm"
            >
              {model.t('translations.deleteConfirmButton')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
