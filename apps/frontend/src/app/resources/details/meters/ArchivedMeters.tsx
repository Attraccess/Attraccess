import { Button, Disclosure } from '@heroui/react';
import { ResourceMeterDto } from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMeterValueFormatter } from '../../../../hooks/useMeterValueFormatter';
import { MeterActions } from './MeterActions';
import en from './en.json';
import de from './de.json';

export function ArchivedMeters({ resourceId, meters }: { resourceId: number; meters: ResourceMeterDto[] }) {
  const formatDateTime = useDateTimeFormatter();
  const { t } = useTranslations({ en, de });
  const format = useMeterValueFormatter();
  if (!meters.length) return null;
  return (
    <Disclosure>
      <Disclosure.Heading>
        <Button slot="trigger" size="sm" variant="ghost">
          {t('archivedTitle', { count: meters.length })}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="flex flex-col gap-4">
          {meters.map((meter) => (
            <div key={meter.id} className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm">
                <h3 className="font-medium break-all">{meter.name}</h3>
                <p className="break-all">
                  {t('lifetime')}: {format(meter.lifetimeValue)}
                </p>
                {meter.archivedAt && (
                  <p className="text-muted">{t('archivedAt', { time: formatDateTime(meter.archivedAt) })}</p>
                )}
              </div>
              <MeterActions resourceId={resourceId} meter={meter} />
            </div>
          ))}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
