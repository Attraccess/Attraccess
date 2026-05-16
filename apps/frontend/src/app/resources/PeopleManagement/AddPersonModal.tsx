import {
  Button,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  TextField,
} from '@heroui/react';
import { TFunction, UserSearch } from '@attraccess/plugins-frontend-ui';
import { User } from '@attraccess/react-query-client';
import { AddMode } from './types';

interface AddPersonModalProps {
  t: TFunction;
  isOpen: boolean;
  mode: AddMode | null;
  user: User | null;
  comment: string;
  isPending: boolean;
  onUserChange: (user: User | null) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function AddPersonModal(props: Readonly<AddPersonModalProps>) {
  const { t, isOpen, mode, user, comment, isPending, onUserChange, onCommentChange, onSubmit, onClose } = props;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <ModalBackdrop>
        <ModalContainer size="md">
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <ModalHeading>
                    {mode === 'introducer' ? t('addModal.title.introducer') : t('addModal.title.introduction')}
                  </ModalHeading>
                </ModalHeader>
                <ModalBody className="flex flex-col gap-4">
                  <UserSearch label={t('addModal.userLabel')} onSelectionChange={onUserChange} />
                  {mode === 'introduction' && (
                    <TextField value={comment} onChange={onCommentChange}>
                      <Label>{t('addModal.commentLabel')}</Label>
                      <TextArea />
                    </TextField>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button variant="ghost" onPress={close} isDisabled={isPending}>
                    {t('addModal.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    onPress={onSubmit}
                    isDisabled={!user}
                    isPending={isPending}
                    data-cy="people-add-submit"
                  >
                    {t('addModal.submit')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
