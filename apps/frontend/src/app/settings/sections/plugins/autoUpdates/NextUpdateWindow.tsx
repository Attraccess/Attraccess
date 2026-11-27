import { nextPluginUpdateWindow, type PluginUpdateSchedule } from '@attraccess/shared';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  /** A complete schedule: at least a weekday, a start, a duration and a zone. */
  schedule: PluginUpdateSchedule;
}

/** The open or next window, written in the schedule's own time zone, and what happens in it. */
export function NextUpdateWindow({ schedule }: Props) {
  const { t, language } = usePluginsTranslations();
  const now = new Date();
  const updateWindow = nextPluginUpdateWindow(schedule, now);
  if (!updateWindow) return null;
  const format = new Intl.DateTimeFormat(language, {
    timeZone: schedule.timeZone ?? 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });
  return (
    <div className="flex flex-col gap-1 text-sm" data-cy="plugins-auto-updates-next-window">
      <p className="font-medium">
        {t(updateWindow.start <= now ? 'autoUpdates.openWindow' : 'autoUpdates.nextWindow', {
          start: format.format(updateWindow.start),
          end: format.format(updateWindow.end),
          timeZone: schedule.timeZone ?? 'UTC',
        })}
      </p>
      <p className="text-muted">{t('autoUpdates.restartNote')}</p>
    </div>
  );
}
