import { useEffect, useState } from 'react';
import { FieldError, Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import {
  Button,
  DurationDisplay,
  StandardModal,
  useFormatedDuration,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { ABSOLUTE_LIMIT_MINUTES, joinMinutes, splitMinutes } from '../../sessionDuration';
import en from './translations/en.json';
import de from './translations/de.json';

const QUICK_PICKS_MINUTES = [30, 60, 120, 240, 480];
const INITIAL_MINUTES = 60;

export interface SessionDurationEstimateDialogProps {
  isOpen: boolean;
  /** The machine's maximum session time; null when it has none. */
  maxMinutes: number | null;
  onConfirm: (minutes: number) => void;
  onCancel: () => void;
}

const toNumber = (raw: string) => {
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Asks how long the user will use the machine at most. Values above the machine's maximum are blocked. */
export function SessionDurationEstimateDialog({
  isOpen,
  maxMinutes,
  onConfirm,
  onCancel,
}: Readonly<SessionDurationEstimateDialogProps>) {
  const { t } = useTranslations({ en, de });
  const limit = maxMinutes ?? ABSOLUTE_LIMIT_MINUTES;
  // Opens at one hour, or at the machine's maximum when that is shorter, so the first value is always valid.
  const initialMinutes = Math.min(INITIAL_MINUTES, limit);
  const [hours, setHours] = useState(() => String(splitMinutes(initialMinutes).hours));
  const [minutes, setMinutes] = useState(() => String(splitMinutes(initialMinutes).minutes));
  const formattedMax = useFormatedDuration(maxMinutes ?? 0);

  const pick = (value: number) => {
    const parts = splitMinutes(value);
    setHours(String(parts.hours));
    setMinutes(String(parts.minutes));
  };

  useEffect(() => {
    if (!isOpen) return;
    const parts = splitMinutes(initialMinutes);
    setHours(String(parts.hours));
    setMinutes(String(parts.minutes));
  }, [isOpen, initialMinutes]);

  const total = joinMinutes(toNumber(hours), toNumber(minutes));
  let problem: string | null = null;
  if (total < 1) problem = t('tooShort');
  else if (total > limit) {
    problem = maxMinutes === null ? t('tooLongAbsolute') : t('tooLong', { max: formattedMax });
  }
  const isInvalid = problem !== null;

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      size="md"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4" data-cy="session-duration-estimate-dialog">
              <p className="text-sm text-muted">{t('hint')}</p>
              {maxMinutes !== null && (
                <p className="text-sm font-medium" data-cy="session-duration-estimate-max">
                  {t('max', { max: formattedMax })}
                </p>
              )}
              <div className="flex gap-3" role="group" aria-label={t('label')}>
                <TextField value={hours} onChange={setHours} isInvalid={isInvalid} className="min-w-0 flex-1">
                  <Label>{t('hours')}</Label>
                  <Input type="number" min={0} data-cy="session-duration-hours" />
                  {/* One message for both fields: the problem is their sum. */}
                  <FieldError data-cy="session-duration-problem">{problem}</FieldError>
                </TextField>
                <TextField value={minutes} onChange={setMinutes} isInvalid={isInvalid} className="min-w-0 flex-1">
                  <Label>{t('minutes')}</Label>
                  <Input type="number" min={0} data-cy="session-duration-minutes" />
                </TextField>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('quickPicks')}>
                {QUICK_PICKS_MINUTES.filter((value) => value <= limit).map((value) => (
                  <Button key={value} size="sm" variant="secondary" onPress={() => pick(value)}>
                    <DurationDisplay minutes={value} />
                  </Button>
                ))}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close}>
              {t('cancel')}
            </Button>
            <Button isDisabled={isInvalid} onPress={() => onConfirm(total)} data-cy="session-duration-confirm">
              {t('confirm')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
