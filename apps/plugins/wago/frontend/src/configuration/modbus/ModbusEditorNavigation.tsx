import { Button } from '@heroui/react';
import { Choice } from './ConfigurationForm';
import type { ModbusConfigurationFormProps } from './ConfigurationForm';
import type { useModbusConfigurationFormState } from './useModbusConfigurationFormState';
export function ModbusEditorNavigation({
  focused,
  model,
  value,
  isDisabled,
}: Pick<ModbusConfigurationFormProps, 'focused' | 'value' | 'isDisabled'> & {
  model: ReturnType<typeof useModbusConfigurationFormState>;
}) {
  return (
    <>
      {focused && (
        <>
          <header>
            <h2 className="wg:text-xl wg:font-semibold">{model.t('editor.devices')}</h2>
            <p className="wg:text-sm wg:text-muted">{model.t('modbus.description')}</p>
          </header>
          <nav aria-label={model.t('modbus.settings')} className="wg:flex wg:flex-wrap wg:gap-2">
            {(['connections', 'devices', 'profiles'] as const).map((key) => (
              <Button
                key={key}
                variant={model.section === key ? 'secondary' : 'ghost'}
                aria-current={model.section === key ? 'page' : undefined}
                onPress={() => model.setSection(key)}
              >
                {model.t(`modbus.${key}`)} ({key === 'profiles' ? model.profiles.length : value[key].length})
              </Button>
            ))}
          </nav>
          {!!model.items.length && (
            <Choice
              label={model.t(
                model.section === 'connections'
                  ? 'modbus.editConnections'
                  : model.section === 'devices'
                    ? 'modbus.editDevices'
                    : 'modbus.editProfiles',
              )}
              value={model.selectedId ?? ''}
              options={model.items.map((item) => item.id)}
              labels={Object.fromEntries(model.items.map((item) => [item.id, item.name]))}
              disabled={isDisabled}
              onChange={(id) => model.setSelected({ ...model.selected, [model.section]: id })}
            />
          )}
          {!model.items.length && (
            <p className="wg:py-4 wg:text-muted">
              {model.t(model.section === 'connections' ? 'modbus.emptyConnections' : 'modbus.emptyDevices')}
            </p>
          )}
        </>
      )}
    </>
  );
}
