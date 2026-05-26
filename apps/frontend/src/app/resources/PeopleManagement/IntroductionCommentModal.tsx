import {
  Form,
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
import { Button } from '../../../components/button';
import { TFunction } from '@attraccess/plugins-frontend-ui';

interface IntroductionCommentModalProps {
  t: TFunction;
  isOpen: boolean;
  comment: string;
  isPending: boolean;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function IntroductionCommentModal(props: Readonly<IntroductionCommentModalProps>) {
  const { t, isOpen, comment, isPending, onCommentChange, onSubmit, onClose } = props;

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
                  <ModalHeading>{t('commentModal.title')}</ModalHeading>
                </ModalHeader>
                <ModalBody>
                  <Form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSubmit();
                    }}
                  >
                    <TextField value={comment} onChange={onCommentChange} className="w-full">
                      <Label>{t('commentModal.title')}</Label>
                      <TextArea />
                    </TextField>
                    <button type="submit" hidden />
                  </Form>
                </ModalBody>
                <ModalFooter>
                  <Button variant="ghost" onPress={close} isDisabled={isPending}>
                    {t('commentModal.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    onPress={onSubmit}
                    isPending={isPending}
                    data-cy="people-revoke-submit"
                  >
                    {t('commentModal.submit')}
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
