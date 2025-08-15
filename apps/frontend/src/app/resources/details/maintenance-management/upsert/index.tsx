import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Modal,
  Textarea,
  ModalBody,
  ModalContent,
  ModalHeader,
  useDisclosure,
  Button,
  ModalFooter,
  Alert,
  Form,
  DatePicker,
  Switch,
} from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { PageHeader } from '../../../../../components/pageHeader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseAbsolute, ZonedDateTime } from '@internationalized/date';
import { CalendarIcon } from 'lucide-react';
import {
  useResourceMaintenancesServiceCreateMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
  useResourceMaintenancesServiceGetMaintenance,
  useResourceMaintenancesServiceUpdateMaintenance,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useNow } from '../../../../../hooks/useNow';

interface Props {
  resourceId: number;
  maintenanceId?: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceMaintenanceUpsertModal(props: Props) {
  const { resourceId, maintenanceId, children: activator } = props;

  const { t } = useTranslations('resource.details.maintenanceManagement.create', {
    de,
    en,
  });

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const now = useNow();

  const timezoneOfBrowser = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [startTime, setStartTime] = useState<ZonedDateTime>(parseAbsolute(now.toISOString(), timezoneOfBrowser));
  const [endTime, setEndTime] = useState<ZonedDateTime | null>(null);
  const [reason, setReason] = useState<string>('');
  const [hasEndDate, setHasEndDate] = useState(false);

  const { data: existingMaintenance } = useResourceMaintenancesServiceGetMaintenance(
    {
      resourceId,
      maintenanceId: maintenanceId ?? 0,
    },
    undefined,
    {
      enabled: maintenanceId !== undefined,
    }
  );

  useEffect(() => {
    if (!existingMaintenance) {
      return;
    }

    setStartTime(parseAbsolute(existingMaintenance.startTime, timezoneOfBrowser));
    setEndTime(parseAbsolute(existingMaintenance.endTime ?? existingMaintenance.startTime, timezoneOfBrowser));
    setReason(existingMaintenance.reason ?? '');
    setHasEndDate(!!existingMaintenance.endTime);
  }, [existingMaintenance, timezoneOfBrowser]);

  const onHasEndDateChange = useCallback(
    (val: boolean) => {
      if (val) {
        setEndTime(parseAbsolute(existingMaintenance?.endTime ?? now.toISOString(), timezoneOfBrowser));
      } else {
        setEndTime(null);
      }

      setHasEndDate(val);
    },
    [existingMaintenance, timezoneOfBrowser, now]
  );

  const onSaveSuccess = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [useResourceMaintenancesServiceFindMaintenancesKey],
    });
    onClose();
  }, [queryClient, onClose]);

  const {
    mutate: createMaintenanceMutation,
    isPending: isCreating,
    error,
  } = useResourceMaintenancesServiceCreateMaintenance({
    onSuccess: onSaveSuccess,
  });

  const { mutate: updateMaintenanceMutation, isPending: isUpdating } = useResourceMaintenancesServiceUpdateMaintenance({
    onSuccess: onSaveSuccess,
  });

  const onSubmit = useCallback(() => {
    const isValid = formRef.current?.reportValidity();
    if (!isValid) {
      return;
    }

    if (!startTime) {
      return;
    }

    if (maintenanceId !== undefined) {
      updateMaintenanceMutation({
        resourceId,
        maintenanceId,
        requestBody: {
          startTime: startTime.toAbsoluteString(),
          endTime: hasEndDate ? endTime?.toAbsoluteString() : null,
          reason,
        },
      });
    } else {
      createMaintenanceMutation({
        resourceId,
        requestBody: {
          startTime: startTime.toAbsoluteString(),
          endTime: hasEndDate ? endTime?.toAbsoluteString() : undefined,
          reason,
        },
      });
    }
  }, [
    createMaintenanceMutation,
    startTime,
    endTime,
    reason,
    resourceId,
    maintenanceId,
    updateMaintenanceMutation,
    hasEndDate,
  ]);

  return (
    <>
      {activator(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            <PageHeader icon={<CalendarIcon />} title={t('title')} noMargin />
          </ModalHeader>

          <ModalBody>
            <Form onSubmit={onSubmit} ref={formRef}>
              <DatePicker
                label={t('inputs.startTime.label')}
                value={startTime}
                isRequired
                hideTimeZone
                onChange={(value) => setStartTime(value as ZonedDateTime)}
              />

              <Switch isSelected={hasEndDate} onValueChange={onHasEndDateChange}>
                {t('inputs.hasEndDate.label')}
              </Switch>
              {hasEndDate && (
                <DatePicker
                  label={t('inputs.endTime.label')}
                  value={endTime}
                  isRequired
                  hideTimeZone
                  onChange={(value) => setEndTime(value as ZonedDateTime)}
                />
              )}

              <Textarea label={t('inputs.reason.label')} value={reason} onChange={(e) => setReason(e.target.value)} />

              {error ? (
                <Alert color="danger" title={t('alert.error.title')} variant="flat">
                  {(error as Error).message}
                </Alert>
              ) : null}

              <button type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button onPress={onSubmit} color="primary" type="submit" isLoading={isCreating || isUpdating}>
              {t('actions.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
