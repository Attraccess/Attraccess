import { Button } from '@heroui/react';
import { Form } from '@heroui/react';
import { EyeIcon } from 'lucide-react';
import { EyeOffIcon } from 'lucide-react';
import { useState } from 'react';
import type { AuthState } from './api';
import { TextFieldRow } from './drawer';
import { useShellyTranslations } from './i18n';
import { Card } from '@heroui/react';
import type { ShellyDeviceInfo } from './api';
import { formatUptime } from './DeviceInfoDrawer.format-uptime.helpers';
import { readPath } from './DeviceInfoDrawer.format-uptime.helpers';
import type { TFunction } from '@attraccess/plugins-frontend-ui';

export function AuthProtectedForm({
  authState,
  currentPassword,
  onChange,
  loading,
  onLoad,
}: {
  authState: AuthState;
  currentPassword: string;
  onChange: (v: string) => void;
  loading: boolean;
  onLoad: () => void;
}) {
  const { t } = useShellyTranslations();
  const [visible, setVisible] = useState(false);

  if (authState !== 'required') return null;

  return (
    <div className="sh:rounded-md sh:border-l-4 sh:border-l-warning sh:bg-warning/5 sh:p-4">
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          onLoad();
        }}
        className="sh:flex sh:flex-col sh:gap-3"
      >
        <p className="sh:text-sm">{t('info.auth')}</p>
        <div className="sh:relative">
          <TextFieldRow
            label={t('password.title')}
            value={currentPassword}
            onChange={onChange}
            placeholder={t('info.passwordPlaceholder')}
            dataCy="shelly-info-current-password"
          />
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={t(visible ? 'password.hide' : 'password.show')}
            className="sh:absolute sh:right-1 sh:top-6"
            onPress={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOffIcon className="sh:h-4 sh:w-4" /> : <EyeIcon className="sh:h-4 sh:w-4" />}
          </Button>
        </div>
        <div className="sh:flex sh:justify-end">
          <Button variant="primary" size="sm" isPending={loading} onPress={onLoad} data-cy="shelly-info-unlock">
            {t('info.load')}
          </Button>
        </div>
        <input type="submit" hidden />
      </Form>
    </div>
  );
}

export function formatInfoValue(value: unknown, t: TFunction, language: string, suffix = ''): string {
  if (value === undefined || value === null || value === '') return t('info.notReported');
  if (typeof value === 'boolean') return t(value ? 'info.on' : 'info.off');
  if (typeof value === 'number') return `${value.toLocaleString(language, { maximumFractionDigits: 1 })}${suffix}`;
  return String(value);
}

export function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function DeviceInfoCards({ info }: { info: ShellyDeviceInfo }) {
  const { t, language } = useShellyTranslations();
  const formatValue = (value: unknown, suffix = '') => formatInfoValue(value, t, language, suffix);
  const status = info.status;
  const config = info.config;
  const output = firstValue(status, ['switch:0.output', 'relays.0.ison', 'lights.0.ison']);
  const power = firstValue(status, ['switch:0.apower', 'meters.0.power', 'lights.0.power']);
  const voltage = firstValue(status, ['switch:0.voltage', 'meters.0.voltage']);
  const current = firstValue(status, ['switch:0.current', 'meters.0.current']);

  const cards: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [
    {
      title: t('devices.device'),
      rows: [
        { label: t('info.name'), value: formatValue(firstValue(config, ['sys.device.name', 'name', 'device.name'])) },
        {
          label: t('info.generation'),
          value:
            info.generation === null
              ? t('devices.unknown')
              : t(info.generation === 1 ? 'devices.generation' : 'devices.generationPlus', {
                  generation: info.generation,
                }),
        },
        { label: t('info.timezone'), value: formatValue(firstValue(config, ['sys.location.tz', 'timezone'])) },
        { label: t('info.uptime'), value: formatUptime(firstValue(status, ['sys.uptime', 'uptime']), t, language) },
      ],
    },
    {
      title: t('info.network'),
      rows: [
        { label: t('add.ip'), value: formatValue(firstValue(status, ['wifi.sta_ip', 'wifi_sta.ip', 'sta_ip'])) },
        { label: t('info.wifi'), value: formatValue(firstValue(status, ['wifi.ssid', 'wifi_sta.ssid', 'ssid'])) },
        { label: t('info.signal'), value: formatValue(firstValue(status, ['wifi.rssi', 'wifi_sta.rssi']), ' dBm') },
      ],
    },
    {
      title: t('info.output'),
      rows: [
        { label: t('info.state'), value: formatValue(output) },
        { label: t('info.power'), value: formatValue(power, ' W') },
        { label: t('info.voltage'), value: formatValue(voltage, ' V') },
        { label: t('info.current'), value: formatValue(current, ' A') },
      ],
    },
  ];

  return (
    <div className="sh:grid sh:gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <Card.Header className="sh:pb-0">
            <span className="sh:text-sm sh:font-semibold">{card.title}</span>
          </Card.Header>
          <Card.Content>
            <dl className="sh:grid sh:grid-cols-1 sh:gap-3 sh:sm:grid-cols-2">
              {card.rows.map((row) => (
                <div key={row.label} className="sh:min-w-0">
                  <dt className="sh:text-xs sh:font-medium sh:uppercase sh:tracking-wide sh:text-default-500">
                    {row.label}
                  </dt>
                  <dd className="sh:mt-1 sh:truncate sh:text-sm sh:text-default-800" title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
