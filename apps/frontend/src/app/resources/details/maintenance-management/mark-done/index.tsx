import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
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
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { StandardDrawer } from '../../../../../components/standardDrawer';

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
      <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChangeHandler}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('actions.markDone.modal.title')}</h2>
        </DrawerHeader>
        <DrawerBody>
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
                <AlertStatusIcon status="danger" />
                <AlertContent>
                  <AlertDescription>{(error as Error).message}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
            <button type="submit" hidden />
          </Form>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={() => setOpen(false)}>
            {t('actions.markDone.modal.cancel')}
          </Button>
          <Button variant="primary" onPress={onSubmit} isPending={isPending}>
            {t('actions.markDone.modal.confirm')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
