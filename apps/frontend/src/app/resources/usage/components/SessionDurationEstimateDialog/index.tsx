import { useEffect, useState } from 'react';
import { Input, Label, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ABSOLUTE_LIMIT_MINUTES, formatDuration, joinMinutes, splitMinutes } from '../../sessionDuration';
import en from './translations/en.json';
import de from './translations/de.json';

const QUICK_PICKS_MINUTES = [30, 60, 120, 240, 480];

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
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');

  useEffect(() => {
    if (isOpen) {
      setHours('1');
      setMinutes('0');
    }
  }, [isOpen]);

  const total = joinMinutes(toNumber(hours), toNumber(minutes));
  const limit = maxMinutes ?? ABSOLUTE_LIMIT_MINUTES;
  let problem: string | null = null;
  if (total < 1) problem = t('tooShort');
  else if (total > limit) {
    problem = maxMinutes === null ? t('tooLongAbsolute') : t('tooLong', { max: formatDuration(maxMinutes) });
  }

  const pick = (value: number) => {
    const parts = splitMinutes(value);
    setHours(String(parts.hours));
    setMinutes(String(parts.minutes));
  };

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
                  {t('max', { max: formatDuration(maxMinutes) })}
                </p>
              )}
              <div className="flex gap-3" role="group" aria-label={t('label')}>
                <TextField value={hours} onChange={setHours} className="min-w-0 flex-1">
                  <Label>{t('hours')}</Label>
                  <Input type="number" min={0} data-cy="session-duration-hours" />
                </TextField>
                <TextField value={minutes} onChange={setMinutes} className="min-w-0 flex-1">
                  <Label>{t('minutes')}</Label>
                  <Input type="number" min={0} data-cy="session-duration-minutes" />
                </TextField>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('quickPicks')}>
                {QUICK_PICKS_MINUTES.filter((value) => value <= limit).map((value) => (
                  <Button key={value} size="sm" variant="secondary" onPress={() => pick(value)}>
                    {formatDuration(value)}
                  </Button>
                ))}
              </div>
              {problem && (
                <p className="text-sm text-danger" role="alert" data-cy="session-duration-problem">
                  {problem}
                </p>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={close}>
              {t('cancel')}
            </Button>
            <Button isDisabled={problem !== null} onPress={() => onConfirm(total)} data-cy="session-duration-confirm">
              {t('confirm')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
