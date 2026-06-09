import { useState, useEffect } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import en from './translations/en.json';
import de from './translations/de.json';

interface SessionTimerProps {
  startTime: string;
  variant?: 'default' | 'hero';
}

function useElapsedTime(startTime: string) {
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');

  useEffect(() => {
    const startTimeMs = new Date(startTime).getTime();

    const updateElapsedTime = () => {
      const now = new Date().getTime();
      const elapsed = now - startTimeMs;

      // Format elapsed time as HH:MM:SS
      const hours = Math.floor(elapsed / (1000 * 60 * 60));
      const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

      setElapsedTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
          .toString()
          .padStart(2, '0')}`,
      );
    };

    // Update immediately and then every second
    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return elapsedTime;
}

export function SessionTimer({ startTime, variant = 'default' }: SessionTimerProps) {
  const { t } = useTranslations({ en, de });
  const elapsedTime = useElapsedTime(startTime);

  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-success-600 dark:text-success-400">
          {t('elapsedTime')}
        </span>
        <span className="font-mono text-5xl font-bold leading-none tabular-nums text-foreground">{elapsedTime}</span>
        <span className="text-xs text-default-500">
          {t('sessionStarted')}: <DateTimeDisplay date={startTime} />
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('sessionStarted')}:</p>
        <p className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
          <DateTimeDisplay date={startTime} />
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('elapsedTime')}:</p>
        <p className="font-medium text-xl text-gray-900 dark:text-white whitespace-nowrap">{elapsedTime}</p>
      </div>
    </div>
  );
}
