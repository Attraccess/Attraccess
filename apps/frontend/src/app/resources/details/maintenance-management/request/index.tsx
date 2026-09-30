import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
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
import { MessageSquareWarningIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import {
  useLicenseServiceGetLicenseInformation,
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenancesServiceCreateMaintenanceRequest,
  useResourceMaintenancesServiceListMaintenanceRequestsKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  children?: (onOpen: () => void) => React.ReactNode;
}

export function RequestMaintenanceButton(props: Props) {
  const { resourceId, children } = props;
  const { t } = useTranslations({ de, en });
  const { isOpen, open, setOpen } = useOverlayState();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: permissions } = useResourceMaintenancesServiceCanManageMaintenance({ resourceId });

  const onSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useResourceMaintenancesServiceListMaintenanceRequestsKey] });
    setSubmitted(true);
  }, [queryClient]);

  const {
    mutate: createRequest,
    isPending,
    error,
    reset,
  } = useResourceMaintenancesServiceCreateMaintenanceRequest({ onSuccess });

  const onSubmit = useCallback(() => {
    if (reason.trim().length < 3) return;
    createRequest({ resourceId, requestBody: { reason: reason.trim() } });
  }, [createRequest, resourceId, reason]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setReason('');
        setSubmitted(false);
        reset();
      }
      setOpen(next);
    },
    [setOpen, reset],
  );

  if (!license?.modules.includes('maintenance') || permissions?.canManage) {
    return null;
  }

  return (
    <>
      {children ? (
        children(open)
      ) : (
        <Button variant="ghost" onPress={open}>
          <MessageSquareWarningIcon className="w-4 h-4" />
          {t('trigger')}
        </Button>
      )}
      <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
        <DrawerHeader>
          <div className="flex items-center gap-2">
            <MessageSquareWarningIcon className="w-5 h-5" />
            <h2 className="text-lg font-semibold">{t('modal.title')}</h2>
          </div>
        </DrawerHeader>
        <DrawerBody>
          {submitted ? (
            <Alert status="success">
              <AlertStatusIcon status="success" />
              <AlertContent>
                <AlertTitle>{t('success.title')}</AlertTitle>
                <AlertDescription>{t('success.description')}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
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
                  required
                  rows={4}
                  className="w-full min-h-24 resize-y"
                />
              </div>
              {error ? (
                <Alert status="danger">
                  <AlertStatusIcon status="danger" />
                  <AlertContent>
                    <AlertTitle>{t('error.title')}</AlertTitle>
                    <AlertDescription>{(error as Error).message}</AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}
              <button type="submit" hidden />
            </Form>
          )}
        </DrawerBody>
        <DrawerFooter>
          {submitted ? (
            <Button variant="primary" onPress={() => onOpenChange(false)}>
              {t('modal.close')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onPress={() => onOpenChange(false)}>
                {t('modal.cancel')}
              </Button>
              <Button variant="primary" onPress={onSubmit} isPending={isPending} isDisabled={reason.trim().length < 3}>
                {t('modal.submit')}
              </Button>
            </>
          )}
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
}
