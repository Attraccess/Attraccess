import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useDisclosure } from '../../../../../utils/heroui-compat';
import { Textarea, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalHeader, Button, ModalFooter, Alert, Form, DatePicker, Switch } from '@heroui/react';
import de from './de.json';
import en from './en.json';
import { PageHeader } from '../../../../../components/pageHeader';
import { MaintenanceReasonDisplay } from '../../../../../components/MaintenanceReasonDisplay';
import { useCallback, useMemo, useRef, useState } from 'react';
import { parseAbsolute, type DateValue, type ZonedDateTime, toZoned } from '@internationalized/date';
import { CalendarIcon } from 'lucide-react';
import {
  useResourceMaintenancesServiceCreateMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useNow } from '../../../../../hooks/useNow';

interface Props {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceMaintenanceUpsertModal(props: Props) {
  const { resourceId, children: activator } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();

  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const now = useNow();

  const timezoneOfBrowser = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [startTime, setStartTime] = useState<ZonedDateTime | null>(parseAbsolute(now.toISOString(), timezoneOfBrowser));
  const [endTime, setEndTime] = useState<ZonedDateTime | null>(null);
  const [reason, setReason] = useState<string>('');
  const [hasEndDate, setHasEndDate] = useState(false);

  const onHasEndDateChange = useCallback(
    (val: boolean) => {
      if (val) {
        setEndTime(parseAbsolute(now.toISOString(), timezoneOfBrowser));
      } else {
        setEndTime(null);
      }
      setHasEndDate(val);
    },
    [timezoneOfBrowser, now],
  );

  const dateValueToAbsoluteString = useCallback(
    (value: DateValue | null): string | null => {
      if (!value) return null;

      if ('toAbsoluteString' in value) {
        return value.toAbsoluteString();
      }
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

  const onSubmit = useCallback(() => {
    const isValid = formRef.current?.reportValidity();
    if (!isValid || !startTime) return;

    const startTimeStr = dateValueToAbsoluteString(startTime);
    const endTimeStr = hasEndDate ? dateValueToAbsoluteString(endTime) : null;
    if (!startTimeStr) return;

    createMaintenanceMutation({
      resourceId,
      requestBody: {
        startTime: startTimeStr,
        endTime: endTimeStr ?? undefined,
        reason,
      },
    });
  }, [
    createMaintenanceMutation,
    startTime,
    endTime,
    reason,
    resourceId,
    hasEndDate,
    dateValueToAbsoluteString,
  ]);

  return (
    <>
      {activator(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {() => (
              <>
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

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">{t('inputs.reason.label')}</label>
                      {reason ? (
                        <p className="text-sm text-default-500 mb-2">
                          {t('inputs.reason.displayedToUsers')}: <MaintenanceReasonDisplay reason={reason} />
                        </p>
                      ) : null}
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>

                    {error ? (
                      <Alert color="danger" title={t('alert.error.title')} variant="flat">
                        {(error as Error).message}
                      </Alert>
                    ) : null}

                    <button type="submit" hidden />
                  </Form>
                </ModalBody>

                <ModalFooter>
                  <Button onPress={onSubmit} color="primary" type="submit" isLoading={isCreating}>
                    {t('actions.save')}
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
