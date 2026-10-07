import { Form } from '@heroui/react';
import { ChannelWorkspace } from './ChannelWorkspace';
import { ConfigurationPresets } from './ConfigurationPresets';
import { ModbusConfigurationForm } from './ModbusConfigurationForm';
import { ModbusChannels } from './ModbusChannels';
import { addModbusChannel, emptyModbus, updateModbusConfiguration } from './modbus-editor';
import { useConfigurationSessionState } from './useConfigurationSessionState';
type Props = Pick<
  ReturnType<typeof useConfigurationSessionState>,
  | 'saveDraft'
  | 'editingDisabled'
  | 't'
  | 'section'
  | 'focusChannelId'
  | 'snapshot'
  | 'metadata'
  | 'edit'
  | 'editMetadata'
  | 'setSection'
  | 'controllerId'
  | 'setPresetBusy'
  | 'setMetadata'
  | 'setFocusChannelId'
  | 'setNotice'
>;
export function ConfigurationSessionForm({
  saveDraft,
  editingDisabled,
  t,
  section,
  focusChannelId,
  snapshot,
  metadata,
  edit,
  editMetadata,
  setSection,
  controllerId,
  setPresetBusy,
  setMetadata,
  setFocusChannelId,
  setNotice,
}: Props) {
  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void saveDraft();
      }}
    >
      <fieldset disabled={editingDisabled} inert={editingDisabled} className="wg:min-w-0">
        <legend className="wg:sr-only">{t('editor.io')}</legend>
        <div hidden={section !== 'channels'}>
          <ChannelWorkspace
            focusChannelId={focusChannelId}
            snapshot={snapshot}
            metadata={metadata}
            onChange={edit}
            onMetadataChange={editMetadata}
            onExternal={() => setSection('devices')}
          />
          <details className="wg:mt-5 wg:rounded-xl wg:border wg:border-border wg:p-4">
            <summary className="wg:cursor-pointer wg:font-medium">{t('editor.applyPreset')}</summary>
            <div className="wg:mt-4 wg:max-w-3xl">
              <ConfigurationPresets
                controllerId={controllerId}
                snapshot={snapshot}
                metadata={metadata}
                onBusyChange={setPresetBusy}
                onApply={(value, application) => {
                  edit(value);
                  setMetadata((current) => ({ ...current, presets: [...current.presets, application] }));
                }}
              />
            </div>
          </details>
        </div>
        <div hidden={section !== 'devices'} className="wg:rounded-xl wg:border wg:border-border wg:p-4">
          <ModbusConfigurationForm
            value={snapshot.modbus ?? emptyModbus}
            focused
            showIdentifiers={false}
            showValidationErrors={false}
            collapseProfiles
            isDisabled={editingDisabled}
            onChange={(modbus) => edit(updateModbusConfiguration(snapshot, modbus))}
            deviceChannels={(deviceId) => (
              <ModbusChannels
                deviceId={deviceId}
                configuration={snapshot.modbus ?? emptyModbus}
                onAdd={(binding, name) => {
                  const next = addModbusChannel(snapshot, binding);
                  setFocusChannelId(next.channel.id);
                  edit(next.snapshot);
                  setMetadata((current) => ({
                    ...current,
                    names: {
                      ...current.names,
                      [next.channel.id]: name.slice(0, 120),
                      [next.point.id]: name.slice(0, 120),
                    },
                  }));
                  setNotice({ key: 'editor.added', data: { name } });
                }}
              />
            )}
          />
        </div>
      </fieldset>
    </Form>
  );
}
