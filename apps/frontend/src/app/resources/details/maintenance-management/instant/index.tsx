import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  TextArea,
  useOverlayState,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { WrenchIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenancesServiceCreateMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  children?: (onOpen: () => void) => React.ReactNode;
}

export function InstantMaintenanceButton(props: Props) {
  const { resourceId, children } = props;
  const { t } = useTranslations({ de, en });
  const { isOpen, open, setOpen, close } = useOverlayState();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const { data: permissions } = useResourceMaintenancesServiceCanManageMaintenance({ resourceId });

  const onSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useResourceMaintenancesServiceFindMaintenancesKey] });
    setReason('');
    close();
  }, [queryClient, close]);

  const {
    mutate: createMaintenance,
    isPending,
    error,
  } = useResourceMaintenancesServiceCreateMaintenance({ onSuccess });

  const onSubmit = useCallback(() => {
    createMaintenance({
      resourceId,
      requestBody: {
        startTime: new Date().toISOString(),
        reason: reason.trim() || undefined,
      },
    });
  }, [createMaintenance, resourceId, reason]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setReason('');
      setOpen(next);
    },
    [setOpen],
  );

  if (!permissions?.canManage) {
    return null;
  }

  return (
    <>
      {children ? (
        children(open)
      ) : (
        <Button variant="secondary" onPress={open}>
          <WrenchIcon className="w-4 h-4" />
          {t('trigger')}
        </Button>
      )}
      <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
        <DrawerHeader>
          <div className="flex items-center gap-2">
            <WrenchIcon className="w-5 h-5" />
            <h2 className="text-lg font-semibold">{t('modal.title')}</h2>
          </div>
        </DrawerHeader>
        <DrawerBody>
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-default-500">{t('modal.description')}</p>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">{t('modal.reasonLabel')}</label>
              <TextArea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('modal.reasonPlaceholder')}
                rows={4}
                className="w-full min-h-24 resize-y"
              />
            </div>
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
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            {t('modal.cancel')}
          </Button>
          <Button variant="primary" onPress={onSubmit} isPending={isPending}>
            {t('modal.confirm')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
