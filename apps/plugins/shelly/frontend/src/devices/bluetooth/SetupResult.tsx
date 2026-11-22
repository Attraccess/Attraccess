import { CheckCircle2Icon } from 'lucide-react';
import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import type { SetupOutcome } from '../../bluetooth/provisioning';

export function SetupResult({
  outcome,
  name,
  passwordSet,
}: {
  outcome: SetupOutcome;
  name: string;
  passwordSet: boolean;
}) {
  const { t } = useShellyTranslations();

  if (outcome.restartRequired) {
    return (
      <StatusAlert status="accent" title={t('ble.result.restartTitle')} data-cy="shelly-ble-restart">
        {t('ble.result.restart')}
      </StatusAlert>
    );
  }

  const bluetoothKey = outcome.bluetooth === 'off' ? 'ble.result.bluetoothOff' : 'ble.result.bluetoothOn';
  return (
    <div className="sh:flex sh:flex-col sh:gap-4" data-cy="shelly-ble-result">
      <div className="sh:flex sh:items-center sh:gap-2 sh:font-semibold">
        <CheckCircle2Icon className="sh:h-5 sh:w-5 sh:text-success" /> {t('ble.result.title')}
      </div>
      <dl className="sh:grid sh:grid-cols-[auto_1fr] sh:gap-x-4 sh:gap-y-1 sh:text-sm">
        <dt className="sh:text-muted">{t('ble.result.name')}</dt>
        <dd>{name}</dd>
        <dt className="sh:text-muted">{t('ble.result.ip')}</dt>
        <dd>{outcome.ipAddress}</dd>
      </dl>
      <ul className="sh:flex sh:list-inside sh:list-disc sh:flex-col sh:gap-1 sh:text-sm">
        {passwordSet && <li>{t('ble.result.passwordSet')}</li>}
        {outcome.bluetooth !== 'refused' && <li>{t(bluetoothKey)}</li>}
      </ul>
      {outcome.alreadyRegistered && (
        <StatusAlert status="warning" title={t('ble.result.alreadyRegistered', { ip: outcome.ipAddress ?? '' })} />
      )}
      {outcome.bluetooth === 'refused' && (
        <StatusAlert status="warning" title={t('ble.result.bluetoothRefused')} data-cy="shelly-ble-refused" />
      )}
    </div>
  );
}
