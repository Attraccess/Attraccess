// Collects what the setup needs. The passwords live only in this component's
// state: it unmounts when the run starts, so they are gone once the form closes.
// Its submit button sits in the drawer footer (SetupFooter), tied by form id.
import { Checkbox, Description, Form, Label } from '@heroui/react';
import { useCallback, useState, type FormEvent } from 'react';
import { PasswordInput, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import type { BleDeviceInfo } from '../../bluetooth/provisioning';
import type { AuthenticatingRpc } from '../../bluetooth/rpc';
import { TextFieldRow } from '../../shared/TextFieldRow';
import type { SetupFormValues } from './useSetupSession';
import { MANUAL, WifiNetworkPicker, type WifiSelection } from './WifiNetworkPicker';

export const SETUP_FORM_ID = 'shelly-ble-form';

export function SetupForm({
  rpc,
  info,
  advertisedName,
  onSubmit,
}: {
  rpc: AuthenticatingRpc;
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
  const [submitted, setSubmitted] = useState(false);

  const manual = selection.choice === MANUAL;
  // Only a typed name is trimmed; a scanned SSID is used exactly as the device reported it.
  const ssid = manual ? selection.manualSsid.trim() : selection.choice;
  const needsWifiPassword = manual || selection.secured;
  // A new password is trimmed like in the admin password drawer; an existing one is used as typed.
  const admin = protectedDevice ? adminPassword : adminPassword.trim();
  const confirmMismatch = !protectedDevice && admin !== confirm.trim();
  // Shown after the first submit and worked out from the current values, so fixing either field clears it.
  const showMismatch = submitted && confirmMismatch && admin !== '';

  const submit = useCallback(() => {
    setSubmitted(true);
    if (!ssid) return setError(t('ble.validation.ssid'));
    if (selection.secured && !manual && !wifiPassword) return setError(t('ble.validation.wifiPassword'));
    if (!admin.trim()) return setError(t('ble.validation.adminPassword'));
    setError(null);
    if (confirmMismatch) return;
    onSubmit({
      wifi: { ssid, password: needsWifiPassword && wifiPassword ? wifiPassword : undefined },
      adminPassword: admin,
      name: name.trim() || advertisedName,
      disableBluetooth,
    });
  }, [
    admin,
    advertisedName,
    confirmMismatch,
    disableBluetooth,
    manual,
    name,
    needsWifiPassword,
    onSubmit,
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
    <Form id={SETUP_FORM_ID} onSubmit={handleSubmit} className="sh:flex sh:flex-col sh:gap-5" data-cy="shelly-ble-form">
      <section className="sh:flex sh:w-full sh:flex-col sh:gap-3">
        <div className="sh:flex sh:flex-col sh:gap-1">
          <h3 className="sh:text-sm sh:font-semibold">{t('ble.wifi.title')}</h3>
          <p className="sh:text-xs sh:text-muted">{t('ble.wifi.description')}</p>
        </div>
        <WifiNetworkPicker
          rpc={rpc}
          selection={selection}
          onChange={setSelection}
          protectedDevice={protectedDevice}
          adminPassword={admin || undefined}
        />
        {needsWifiPassword && (
          <PasswordInput
            label={t('ble.wifi.password')}
            value={wifiPassword}
            onChange={setWifiPassword}
            description={manual ? t('ble.wifi.passwordManualDescription') : undefined}
            // A Wi-Fi key, not a login for this site: keep the browser from saving or generating one.
            autoComplete="off"
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
              isInvalid={showMismatch}
              errorMessage={showMismatch ? t('ble.admin.mismatch') : undefined}
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

      {error && (
        <StatusAlert status="danger" data-cy="shelly-ble-form-error">
          {error}
        </StatusAlert>
      )}
    </Form>
  );
}
