import { Form, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextArea, TextField } from '@heroui/react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface IntroductionCommentModalProps {
  isOpen: boolean;
  comment: string;
  isPending: boolean;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function IntroductionCommentModal(props: Readonly<IntroductionCommentModalProps>) {
  const { isOpen, comment, isPending, onCommentChange, onSubmit, onClose } = props;
  const { t } = useTranslations({ en, de });

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      size="md"
    >
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
            <Button variant="primary" onPress={onSubmit} isPending={isPending} data-cy="people-revoke-submit">
              {t('commentModal.submit')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
