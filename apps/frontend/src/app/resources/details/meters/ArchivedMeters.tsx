import { Button, Disclosure } from '@heroui/react';
import { ResourceMeterDto } from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMeterValueFormatter } from '../../../../hooks/useMeterValueFormatter';
import { MeterActions } from './MeterActions';
import en from './en.json';
import de from './de.json';

/** The collapsed list of archived meters, for people who may edit the resource. */
export function ArchivedMeters({
  resourceId,
  meters,
  onMoved,
}: {
  resourceId: number;
  meters: ResourceMeterDto[];
  onMoved?: (moved: { meterId: number; restored: boolean }) => void;
}) {
  const formatDateTime = useDateTimeFormatter();
  const { t } = useTranslations({ en, de });
  const format = useMeterValueFormatter();
  if (!meters.length) return null;
  return (
    // MetersCard tells these menus apart from the active ones by this marker.
    <div data-cy="archived-meters">
      <Disclosure>
        <Disclosure.Heading>
          <Button slot="trigger" size="sm" variant="ghost">
            {t('archivedTitle', { count: meters.length })}
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          {/* No Disclosure.Body: its side padding would move the names and ⋮ menus out of line with the active meters. */}
          <div className="flex flex-col gap-4 py-2">
            {meters.map((meter) => (
              <div key={meter.id} className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 text-sm">
                  <h4 className="font-medium break-all">{meter.name}</h4>
                  <p className="break-all">
                    {t('lifetime')}: {format(meter.lifetimeValue)}
                  </p>
                  {meter.archivedAt && (
                    <p className="text-muted">{t('archivedAt', { time: formatDateTime(meter.archivedAt) })}</p>
                  )}
                </div>
                <MeterActions resourceId={resourceId} meter={meter} onMoved={onMoved} />
              </div>
            ))}
          </div>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
