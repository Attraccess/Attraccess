import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading, Button, Textarea, Form, Alert, useOverlayState } from '@heroui/react';
import de from '../de.json';
import en from '../en.json';
import {
  useResourceMaintenancesServiceFinishMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

interface Props {
  resourceId: number;
  maintenanceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function MarkDoneModal(props: Props) {
  const { resourceId, maintenanceId, children } = props;
  const { isOpen, open, setOpen, close } = useOverlayState();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [notes, setNotes] = useState('');

  const { t } = useTranslations({
    de,
    en,
  });

  const onSuccess = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [useResourceMaintenancesServiceFindMaintenancesKey],
    });
    setNotes('');
    close();
  }, [queryClient, close]);

  const { mutate: finishMaintenance, isPending, error } = useResourceMaintenancesServiceFinishMaintenance({
    onSuccess,
  });

  const onSubmit = useCallback(() => {
    finishMaintenance({
      resourceId,
      maintenanceId,
      requestBody: { notes: notes.trim() || undefined },
    });
  }, [finishMaintenance, resourceId, maintenanceId, notes]);

  const onOpenChangeHandler = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) setNotes('');
      setOpen(isOpen);
    },
    [setOpen]
  );

  return (
    <>
      {children(open)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChangeHandler}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {({ close }) => (
              <>
                <ModalHeader>
                  <ModalHeading>{t('actions.markDone.modal.title')}</ModalHeading>
                </ModalHeader>
                <ModalBody>
                  <Form
                    ref={formRef}
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSubmit();
                    }}
                  >
                    <Textarea
                      label={t('actions.markDone.modal.notesLabel')}
                      placeholder={t('actions.markDone.modal.notesPlaceholder')}
                      description={t('actions.markDone.modal.notesOptional')}
                      value={notes}
                      onValueChange={setNotes}
                    />
                    {error ? (
                      <Alert color="danger" variant="flat">
                        {(error as Error).message}
                      </Alert>
                    ) : null}
                    <button type="submit" hidden />
                  </Form>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={close}>
                    {t('actions.markDone.modal.cancel')}
                  </Button>
                  <Button color="primary" onPress={onSubmit} isLoading={isPending}>
                    {t('actions.markDone.modal.confirm')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
