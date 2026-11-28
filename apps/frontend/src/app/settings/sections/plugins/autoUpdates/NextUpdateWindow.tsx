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
  const timeZone = schedule.timeZone ?? 'UTC';
  const time = { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
  const day = { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } as const;
  const dateTime = new Intl.DateTimeFormat(language, { ...day, ...time });
  const sameDay = (left: Date, right: Date) =>
    new Intl.DateTimeFormat(language, day).format(left) === new Intl.DateTimeFormat(language, day).format(right);
  // The zone follows in brackets, so the times do not name it again.
  const end = sameDay(updateWindow.start, updateWindow.end)
    ? new Intl.DateTimeFormat(language, time).format(updateWindow.end)
    : dateTime.format(updateWindow.end);
  return (
    <div className="flex flex-col gap-1 text-sm" data-cy="plugins-auto-updates-next-window">
      <p className="font-medium">
        {t(updateWindow.start <= now ? 'autoUpdates.openWindow' : 'autoUpdates.nextWindow', {
          start: dateTime.format(updateWindow.start),
          end,
          timeZone,
        })}
      </p>
      <p className="text-muted">{t('autoUpdates.restartNote')}</p>
    </div>
  );
}
