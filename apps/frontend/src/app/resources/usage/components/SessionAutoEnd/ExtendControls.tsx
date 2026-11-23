import { cn } from '@heroui/react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  EXTEND_STEPS_MINUTES,
  extensionRoomMinutes,
  type ExtendStep,
  type SessionDeadline,
} from '../../sessionDuration';
import en from './translations/en.json';
import de from './translations/de.json';

interface ExtendControlsProps {
  session: SessionDeadline;
  isPending: boolean;
  onExtend: (request: { extendByMinutes: ExtendStep } | { toMax: true }) => void;
  /** Center the buttons, for centered session cards. */
  centered?: boolean;
}

/** +1h … +24h and "extend to maximum"; steps that would pass the cap are disabled. */
export function ExtendControls({ session, isPending, onExtend, centered = false }: Readonly<ExtendControlsProps>) {
  const { t } = useTranslations({ en, de });
  const room = extensionRoomMinutes(session);

  if (room <= 0) {
    return (
      <p className="text-sm text-muted" data-cy="session-extend-max-reached">
        {t('maxReached')}
      </p>
    );
  }

  return (
    <div
      className={cn('flex flex-wrap gap-2', centered && 'justify-center')}
      role="group"
      aria-label={t('extend')}
      data-cy="session-extend-controls"
    >
      {EXTEND_STEPS_MINUTES.map((minutes) => (
        <Button
          key={minutes}
          size="sm"
          variant="secondary"
          isDisabled={isPending || minutes > room}
          onPress={() => onExtend({ extendByMinutes: minutes })}
          data-cy={`session-extend-${minutes}`}
        >
          {t('extendBy', { hours: minutes / 60 })}
        </Button>
      ))}
      {session.maxAutoEndAt && (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={isPending}
          onPress={() => onExtend({ toMax: true })}
          data-cy="session-extend-to-max"
        >
          {t('extendToMax')}
        </Button>
      )}
    </div>
  );
}
