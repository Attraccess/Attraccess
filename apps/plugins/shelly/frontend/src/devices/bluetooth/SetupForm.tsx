// Collects what the setup needs. The passwords live only in this component's
// state: it unmounts when the run starts, so they are gone once the form closes.
import { Checkbox, Description, Form, Label } from '@heroui/react';
import { BluetoothIcon } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { Button, PasswordInput, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import { ADMIN_USERNAME, type BleDeviceInfo } from '../../bluetooth/provisioning';
import type { ShellyBleRpc } from '../../bluetooth/rpc';
import { TextFieldRow } from '../../shared/TextFieldRow';
import { MANUAL, WifiNetworkPicker, type WifiSelection } from './WifiNetworkPicker';

export interface SetupFormValues {
  wifi: { ssid: string; password?: string };
  adminPassword: string;
  name: string;
  disableBluetooth: boolean;
}

export function SetupForm({
  rpc,
  info,
  advertisedName,
  onSubmit,
}: {
  rpc: ShellyBleRpc;
  info: BleDeviceInfo;
  advertisedName: string;
  onSubmit: (values: SetupFormValues) => void;
}) {
  const { t } = useShellyTranslations();
  const protectedDevice = Boolean(info.auth_en);
  const [selection, setSelection] = useState<WifiSelection>({ choice: '', manualSsid: '', secured: false });
  const [wifiPassword, setWifiPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState(advertisedName);
  const [disableBluetooth, setDisableBluetooth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const manual = selection.choice === MANUAL;
  const ssid = (manual ? selection.manualSsid : selection.choice).trim();
  const needsWifiPassword = manual || selection.secured;

  const submit = useCallback(() => {
    const admin = adminPassword.trim();
    if (!ssid) return setError(t('ble.validation.ssid'));
    if (selection.secured && !manual && !wifiPassword) return setError(t('ble.validation.wifiPassword'));
    if (!admin) return setError(t('ble.validation.adminPassword'));
    if (!protectedDevice && admin !== confirm.trim()) return setError(t('ble.admin.mismatch'));
    setError(null);
    onSubmit({
      wifi: { ssid, password: needsWifiPassword && wifiPassword ? wifiPassword : undefined },
      adminPassword: admin,
      name: name.trim() || advertisedName,
      disableBluetooth,
    });
  }, [
    adminPassword,
    advertisedName,
    confirm,
    disableBluetooth,
    manual,
    name,
    needsWifiPassword,
    onSubmit,
    protectedDevice,
    selection.secured,
    ssid,
    t,
    wifiPassword,
  ]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  return (
    <Form onSubmit={handleSubmit} className="sh:flex sh:flex-col sh:gap-5" data-cy="shelly-ble-form">
      <section className="sh:flex sh:w-full sh:flex-col sh:gap-3">
        <h3 className="sh:text-sm sh:font-semibold">{t('ble.wifi.title')}</h3>
        <WifiNetworkPicker
          rpc={rpc}
          selection={selection}
          onChange={setSelection}
          protectedDevice={protectedDevice}
          beforeRescan={() => {
            // A protected device refuses the first scan; retry with the password entered so far.
            if (protectedDevice && adminPassword.trim()) rpc.setCredentials(ADMIN_USERNAME, adminPassword.trim());
          }}
        />
        {needsWifiPassword && (
          <PasswordInput
            label={t('ble.wifi.password')}
            value={wifiPassword}
            onChange={setWifiPassword}
            description={manual ? t('ble.wifi.passwordManualDescription') : undefined}
            autoComplete="new-password"
            data-cy="shelly-ble-wifi-password"
          />
        )}
      </section>

      <section className="sh:flex sh:w-full sh:flex-col sh:gap-3">
        {protectedDevice ? (
          <PasswordInput
            label={t('ble.admin.current')}
            value={adminPassword}
            onChange={setAdminPassword}
            description={t('ble.admin.currentDescription')}
            autoComplete="current-password"
            isRequired
            data-cy="shelly-ble-admin-password"
          />
        ) : (
          <>
            <PasswordInput
              label={t('ble.admin.new')}
              value={adminPassword}
              onChange={setAdminPassword}
              description={t('ble.admin.newDescription')}
              autoComplete="new-password"
              isRequired
              data-cy="shelly-ble-admin-password"
            />
            <PasswordInput
              label={t('ble.admin.confirm')}
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              isRequired
              data-cy="shelly-ble-admin-confirm"
            />
          </>
        )}
      </section>

      <TextFieldRow
        label={t('ble.name.label')}
        value={name}
        onChange={setName}
        description={t('ble.name.description')}
        dataCy="shelly-ble-name"
      />

      <Checkbox isSelected={disableBluetooth} onChange={setDisableBluetooth} data-cy="shelly-ble-disable">
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Label>{t('ble.disable.label')}</Label>
        </Checkbox.Content>
        <Description>{t('ble.disable.description')}</Description>
      </Checkbox>

      <p className="sh:text-xs sh:text-muted">{t('ble.secretsNote')}</p>

      {error && <StatusAlert status="danger" title={error} data-cy="shelly-ble-form-error" />}
      <div className="sh:flex sh:justify-end">
        <Button variant="primary" type="submit" data-cy="shelly-ble-start">
          <BluetoothIcon className="sh:h-4 sh:w-4" /> {t('ble.begin')}
        </Button>
      </div>
    </Form>
  );
}
