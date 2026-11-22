import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import type { SetupOutcome } from '../../bluetooth/provisioning';

const BLUETOOTH_LINE: Partial<Record<SetupOutcome['bluetooth'], string>> = {
  off: 'ble.result.bluetoothOff',
  'left-on': 'ble.result.bluetoothOn',
};

const BLUETOOTH_WARNING: Partial<Record<SetupOutcome['bluetooth'], string>> = {
  refused: 'ble.result.bluetoothRefused',
  unknown: 'ble.result.bluetoothUnknown',
};

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

  const bluetoothLine = BLUETOOTH_LINE[outcome.bluetooth];
  const bluetoothWarning = BLUETOOTH_WARNING[outcome.bluetooth];
  return (
    <div className="sh:flex sh:flex-col sh:gap-4" data-cy="shelly-ble-result">
      <StatusAlert status="success" title={t('ble.result.title')} />
      <dl className="sh:grid sh:grid-cols-[auto_1fr] sh:gap-x-4 sh:gap-y-1 sh:text-sm">
        <dt className="sh:text-muted">{t('ble.result.name')}</dt>
        <dd className="sh:break-all">{name}</dd>
        <dt className="sh:text-muted">{t('ble.result.ip')}</dt>
        <dd className="sh:break-all">{outcome.ipAddress}</dd>
      </dl>
      <ul className="sh:flex sh:list-inside sh:list-disc sh:flex-col sh:gap-1 sh:text-sm">
        {passwordSet && <li>{t('ble.result.passwordSet')}</li>}
        {bluetoothLine && <li>{t(bluetoothLine)}</li>}
      </ul>
      {outcome.alreadyRegistered && (
        <StatusAlert status="warning" data-cy="shelly-ble-already-registered">
          {t('ble.result.alreadyRegistered', { ip: outcome.ipAddress ?? '' })}
        </StatusAlert>
      )}
      {bluetoothWarning && (
        <StatusAlert status="warning" data-cy="shelly-ble-bluetooth-warning">
          {t(bluetoothWarning)}
        </StatusAlert>
      )}
    </div>
  );
}
