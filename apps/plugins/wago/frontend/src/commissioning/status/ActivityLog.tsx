import { useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from '../../i18n';
import { formatActivity, parseActivityLog } from '../model';

export function ActivityLog({ auditLog }: { auditLog: string }) {
  const formatTime = useDateTimeFormatter({ showDate: false, showSeconds: true });
  const { t } = useWagoTranslations();
  const events = parseActivityLog(auditLog);
  if (!events.length) return null;
  return (
    <div className="wg:mt-4 wg:border-t wg:border-default-200 wg:pt-3">
      <p className="wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">
        {t('commissioningUI.activity')}
      </p>
      <ol className="wg:mt-2 wg:space-y-1">
        {events.map((event) => (
          <li key={`${event.at}-${event.event}`} className="wg:text-xs wg:text-muted">
            <span className="wg:text-foreground">{formatActivity(event.event)}</span>{' '}
            <span>{formatTime(event.at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
