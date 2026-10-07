import { Card } from '@heroui/react';
import { type ShellyDeviceInfo } from './api';
import { useShellyTranslations } from './i18n';
import { formatInfoValue } from './DeviceInfoDrawer.format-info-value';
import { firstValue } from './DeviceInfoDrawer.first-value';
import { formatUptime } from './DeviceInfoDrawer.format-uptime';

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
