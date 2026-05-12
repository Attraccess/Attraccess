import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  Button,
  Form,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextArea,
  useOverlayState,
} from '@heroui/react';
import de from '../de.json';
import en from '../en.json';
import {
  useResourceMaintenancesServiceFinishMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { AlertCircleIcon } from 'lucide-react';

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

  const {
    mutate: finishMaintenance,
    isPending,
    error,
  } = useResourceMaintenancesServiceFinishMaintenance({
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
    [setOpen],
  );

  return (
    <>
      {children(open)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChangeHandler}>
        <ModalBackdrop>
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
                      <TextArea
                        placeholder={t('actions.markDone.modal.notesPlaceholder')}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                      {error ? (
                        <Alert status="danger">
                          <AlertIndicator>
                            <AlertCircleIcon />
                          </AlertIndicator>
                          <AlertContent>
                            <AlertDescription>{(error as Error).message}</AlertDescription>
                          </AlertContent>
                        </Alert>
                      ) : null}
                      <button type="submit" hidden />
                    </Form>
                  </ModalBody>
                  <ModalFooter>
                    <Button variant="ghost" onPress={close}>
                      {t('actions.markDone.modal.cancel')}
                    </Button>
                    <Button variant="primary" onPress={onSubmit} isPending={isPending}>
                      {t('actions.markDone.modal.confirm')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
