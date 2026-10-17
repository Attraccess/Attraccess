import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from '@heroui/react';
import { useRabbitmqUserPanelState } from './useRabbitmqUserPanelState';
type Props = Pick<
  ReturnType<typeof useRabbitmqUserPanelState>,
  't' | 'userToDelete' | 'deleteError' | 'tMessage' | 'confirmDelete' | 'deleting'
>;
export function RabbitmqUserPanelModalBackdrop({
  t,
  userToDelete,
  deleteError,
  tMessage,
  confirmDelete,
  deleting,
}: Props) {
  return (
    <ModalBackdrop>
      <ModalContainer size="sm">
        <ModalDialog>
          {({ close }) => (
            <>
              <ModalHeader>
                <ModalHeading>{t('users.deleteTitle')}</ModalHeading>
              </ModalHeader>
              <ModalBody className="rmq:flex rmq:flex-col rmq:gap-3">
                <p>{t('users.deleteDescription', { name: userToDelete?.name })}</p>
                {deleteError && (
                  <Alert status="danger" data-cy="rabbitmq-user-delete-error-alert">
                    <AlertContent>
                      <AlertDescription>{tMessage(deleteError)}</AlertDescription>
                    </AlertContent>
                  </Alert>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={close} data-cy="rabbitmq-user-delete-cancel-button">
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  onPress={() => void confirmDelete()}
                  isPending={deleting}
                  data-cy="rabbitmq-user-delete-confirm-button"
                >
                  {t('common.delete')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalDialog>
      </ModalContainer>
    </ModalBackdrop>
  );
}
