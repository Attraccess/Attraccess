import { Button } from '@heroui/react';
import type { ModbusConfiguration, ModbusProfile } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import { Choice } from './Choice';

export type ModbusEditorSection = 'connections' | 'devices' | 'profiles';

interface ModbusEditorNavigationProps {
  value: ModbusConfiguration;
  profiles: ModbusProfile[];
  section: ModbusEditorSection;
  onSectionChange: (section: ModbusEditorSection) => void;
  items: { id: string; name: string }[];
  selectedId: string | undefined;
  onSelect: (section: ModbusEditorSection, id: string) => void;
  isDisabled: boolean;
}

export function ModbusEditorNavigation({
  value,
  profiles,
  section,
  onSectionChange,
  items,
  selectedId,
  onSelect,
  isDisabled,
}: ModbusEditorNavigationProps) {
  const { t } = useWagoTranslations();
  return (
    <>
      <header>
        <h2 className="wg:text-xl wg:font-semibold">{t('editor.devices')}</h2>
        <p className="wg:text-sm wg:text-muted">{t('modbus.description')}</p>
      </header>
      <nav aria-label={t('modbus.settings')} className="wg:flex wg:flex-wrap wg:gap-2">
        {(['connections', 'devices', 'profiles'] as const).map((key) => (
          <Button
            key={key}
            variant={section === key ? 'secondary' : 'ghost'}
            aria-current={section === key ? 'page' : undefined}
            onPress={() => onSectionChange(key)}
          >
            {t(`modbus.${key}`)} ({key === 'profiles' ? profiles.length : value[key].length})
          </Button>
        ))}
      </nav>
      {!!items.length && (
        <Choice
          label={t(
            section === 'connections'
              ? 'modbus.editConnections'
              : section === 'devices'
                ? 'modbus.editDevices'
                : 'modbus.editProfiles',
          )}
          value={selectedId ?? ''}
          options={items.map((item) => item.id)}
          labels={Object.fromEntries(items.map((item) => [item.id, item.name]))}
          disabled={isDisabled}
          onChange={(id) => onSelect(section, id)}
        />
      )}
      {!items.length && (
        <p className="wg:py-4 wg:text-muted">
          {t(section === 'connections' ? 'modbus.emptyConnections' : 'modbus.emptyDevices')}
        </p>
      )}
    </>
  );
}
