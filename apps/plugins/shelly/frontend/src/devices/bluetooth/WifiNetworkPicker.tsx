// Networks the device sees (strongest first) plus manual entry for hidden
// networks or a failed scan. Reports the choice; the password lives in the form.
import { Label, Radio, RadioGroup, Spinner } from '@heroui/react';
import { RefreshCwIcon } from 'lucide-react';
import { Button, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import type { RpcCaller } from '../../bluetooth/rpc';
import { TextFieldRow } from '../../shared/TextFieldRow';
import { useWifiScan } from './useWifiScan';

export const MANUAL = '__manual__';

export interface WifiSelection {
  /** An SSID from the scan list, or MANUAL. */
  choice: string;
  manualSsid: string;
  /** Secured networks need a password; manual entries may leave it empty (open). */
  secured: boolean;
}

export function WifiNetworkPicker({
  rpc,
  selection,
  onChange,
}: {
  rpc: RpcCaller;
  selection: WifiSelection;
  onChange: (selection: WifiSelection) => void;
}) {
  const { t } = useShellyTranslations();
  const { state, rescan } = useWifiScan(rpc);
  const networks = state.status === 'done' ? state.networks : [];
  const manual = selection.choice === MANUAL || state.status === 'failed';

  return (
    <div className="sh:flex sh:flex-col sh:gap-3" data-cy="shelly-ble-wifi">
      {state.status === 'scanning' && (
        <div className="sh:flex sh:items-center sh:gap-3 sh:text-sm sh:text-muted">
          <Spinner color="accent" size="sm" />
          {t('ble.wifi.scanning')}
        </div>
      )}
      {state.status === 'failed' && <StatusAlert status="warning" title={t('ble.wifi.scanFailed')} />}
      {state.status === 'done' && networks.length === 0 && (
        <p className="sh:text-sm sh:text-muted">{t('ble.wifi.none')}</p>
      )}
      {state.status === 'done' && (
        <RadioGroup
          value={selection.choice}
          onChange={(choice) => {
            const network = networks.find((n) => n.ssid === choice);
            onChange({ ...selection, choice, secured: network?.secured ?? false });
          }}
          data-cy="shelly-ble-networks"
        >
          <Label className="sr-only">{t('ble.wifi.networks')}</Label>
          {networks.map((network) => (
            <Radio key={network.ssid} value={network.ssid}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                <Label>
                  {network.ssid}{' '}
                  <span className="sh:text-xs sh:text-muted">
                    {t(network.secured ? 'ble.wifi.secured' : 'ble.wifi.open')} ·{' '}
                    {t('ble.wifi.signal', { rssi: network.rssi })}
                  </span>
                </Label>
              </Radio.Content>
            </Radio>
          ))}
          <Radio value={MANUAL}>
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Label>{t('ble.wifi.other')}</Label>
            </Radio.Content>
          </Radio>
        </RadioGroup>
      )}
      {manual && (
        <TextFieldRow
          label={t('ble.wifi.ssid')}
          value={selection.manualSsid}
          onChange={(manualSsid) => onChange({ ...selection, choice: MANUAL, manualSsid, secured: false })}
          required
          dataCy="shelly-ble-ssid"
        />
      )}
      {state.status !== 'scanning' && (
        <div>
          <Button variant="ghost" size="sm" onPress={rescan}>
            <RefreshCwIcon className="sh:h-4 sh:w-4" /> {t('ble.wifi.rescan')}
          </Button>
        </div>
      )}
    </div>
  );
}
