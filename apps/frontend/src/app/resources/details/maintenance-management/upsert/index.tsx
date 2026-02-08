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
import { parseAbsolute, type DateValue, toZoned } from '@internationalized/date';
import { CalendarIcon } from 'lucide-react';
import {
  useResourceMaintenancesServiceCreateMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
  useResourceMaintenancesServiceGetMaintenance,
  useResourceMaintenancesServiceUpdateMaintenance,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useNow } from '../../../../../hooks/useNow';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';

interface Props {
  resourceId: number;
  maintenanceId?: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceMaintenanceUpsertModal(props: Props) {
  const { resourceId, maintenanceId, children: activator } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const now = useNow();

  const timezoneOfBrowser = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [startTime, setStartTime] = useState<DateValue | null>(parseAbsolute(now.toISOString(), timezoneOfBrowser));
  const [endTime, setEndTime] = useState<DateValue | null>(null);
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
    },
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
    [existingMaintenance, timezoneOfBrowser, now],
  );

  const dateValueToAbsoluteString = useCallback(
    (value: DateValue | null): string | null => {
      if (!value) return null;

      // If it's already a ZonedDateTime, use toAbsoluteString
      if ('toAbsoluteString' in value) {
        return value.toAbsoluteString();
      }

      // Otherwise, convert to ZonedDateTime first
      const zonedValue = toZoned(value, timezoneOfBrowser);
      return zonedValue.toAbsoluteString();
    },
    [timezoneOfBrowser],
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

    const startTimeStr = dateValueToAbsoluteString(startTime);
    const endTimeStr = hasEndDate ? dateValueToAbsoluteString(endTime) : null;

    if (!startTimeStr) {
      return;
    }

    if (maintenanceId !== undefined) {
      updateMaintenanceMutation({
        resourceId,
        maintenanceId,
        requestBody: {
          startTime: startTimeStr,
          endTime: endTimeStr,
          reason,
        },
      });
    } else {
      createMaintenanceMutation({
        resourceId,
        requestBody: {
          startTime: startTimeStr,
          endTime: endTimeStr ?? undefined,
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
    dateValueToAbsoluteString,
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
                onChange={setStartTime}
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
                  onChange={setEndTime}
                />
              )}

              <Textarea label={t('inputs.reason.label')} value={reason} onChange={(e) => setReason(e.target.value)} />

              {existingMaintenance && (
                <div className="rounded-lg border border-default-200 bg-default-50 p-3 text-sm">
                  <div className="font-medium text-default-600 mb-2">{t('audit.createdBy')}: {(existingMaintenance.createdByUser as { username?: string } | undefined)?.username ?? '—'}</div>
                  {existingMaintenance.endTime && (
                    <>
                      <div className="font-medium text-default-600 mb-1">{t('audit.completedBy')}: {(existingMaintenance.completedByUser as { username?: string } | undefined)?.username ?? '—'}</div>
                      {existingMaintenance.completedAt && (
                        <div className="font-medium text-default-600">{t('audit.completedAt')}: <DateTimeDisplay date={existingMaintenance.completedAt} /></div>
                      )}
                    </>
                  )}
                </div>
              )}

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
