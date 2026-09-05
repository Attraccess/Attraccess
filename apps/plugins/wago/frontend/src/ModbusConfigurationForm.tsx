import { Button, Description, Input, Label, ListBox, Select, TextField } from '@heroui/react';
import { useState } from 'react';
import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  findProfile,
  type ModbusConfiguration,
  type ModbusPoint,
  type ModbusProfile,
  type RegisterFormat,
  validateModbus,
} from '../../modbus/model';

export interface ModbusConfigurationFormProps {
  value: ModbusConfiguration;
  onChange: (value: ModbusConfiguration) => void;
  isDisabled?: boolean;
  showIdentifiers?: boolean;
  collapseProfiles?: boolean;
  showValidationErrors?: boolean;
}
/** Host editor sets hardwareProfile=modbus and channel=0; binding uses names, not channel offsets. */
export function ModbusPointForm({
  configuration,
  value,
  onChange,
  isDisabled = false,
}: {
  configuration: ModbusConfiguration;
  value: ModbusPoint;
  onChange: (value: ModbusPoint) => void;
  isDisabled?: boolean;
}) {
  const device = configuration.devices.find((d) => d.id === value.deviceId);
  const profile = device && findProfile(configuration, device);
  return (
    <div className="wg:flex wg:flex-col wg:gap-3">
      <Choice
        label="Modbus device"
        value={value.deviceId}
        options={configuration.devices.map((d) => d.id)}
        labels={Object.fromEntries(configuration.devices.map((d) => [d.id, d.name]))}
        disabled={isDisabled}
        onChange={(deviceId) => onChange({ deviceId })}
      />
      <Select
        isDisabled={isDisabled}
        value={value.measurementId ?? ''}
        onChange={(key) => onChange({ ...value, measurementId: key ? String(key) : undefined })}
      >
        <Label>Named measurement</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue="None">
              None
            </ListBox.Item>
            {profile?.measurements.map((m) => (
              <ListBox.Item id={m.id} key={m.id} textValue={m.name}>
                {m.name} ({m.unit})
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Select
        isDisabled={isDisabled}
        value={value.actionId ?? ''}
        onChange={(key) => onChange({ ...value, actionId: key ? String(key) : undefined })}
      >
        <Label>Named action</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="" textValue="None">
              None
            </ListBox.Item>
            {profile?.actions.map((a) => (
              <ListBox.Item id={a.id} key={a.id} textValue={a.name}>
                {a.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Description>
        Measurement channels use the profile unit/kind, scale 1 and offset 0. Register scaling is applied once by the
        device profile.
      </Description>
    </div>
  );
}
const emptyFormat: RegisterFormat = {
  address: 0,
  addressBase: 0,
  dataType: 'uint16',
  byteOrder: 'big',
  wordOrder: 'big',
  scale: 1,
  offset: 0,
};
function Field({
  label,
  value,
  onChange,
  numeric = false,
  allowEmpty = false,
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  numeric?: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const display = Number.isNaN(value) ? '' : String(value);
  // Keep incomplete numeric text only while it still represents our own emitted value.
  // An authoritative replacement must take precedence, including while focused.
  const [edit, setEdit] = useState<{ text: string; value: string | number } | null>(null);
  const currentEdit = edit && Object.is(edit.value, value) ? edit : null;
  if (edit && !currentEdit) setEdit(null);
  return (
    <TextField
      isDisabled={disabled}
      isInvalid={numeric && Number.isNaN(value)}
      value={currentEdit?.text ?? display}
      onBlur={() => setEdit(null)}
      onChange={(text) => {
        const emitted = numeric && !allowEmpty && text.trim() === '' ? 'NaN' : text;
        setEdit({ text, value: numeric && !(allowEmpty && text === '') ? Number(emitted) : emitted });
        onChange(emitted);
      }}
    >
      <Label>{label}</Label>
      <Input type="text" inputMode={numeric ? 'decimal' : undefined} />
    </TextField>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
  labels = {},
}: {
  label: string;
  value: string | number;
  labels?: Record<string, string>;
  options: readonly (string | number)[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select isDisabled={disabled} value={String(value)} onChange={(key) => key !== null && onChange(String(key))}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={String(option)} key={option} textValue={labels[String(option)] ?? String(option)}>
              {labels[String(option)] ?? option}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
function FormatFields({
  value,
  onChange,
  disabled,
}: {
  value: RegisterFormat;
  onChange: (value: RegisterFormat) => void;
  disabled: boolean;
}) {
  return (
    <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
      {(['address', 'scale', 'offset'] as const).map((key) => (
        <Field
          key={key}
          label={key === 'address' ? 'Register address (decimal)' : key}
          value={value[key]}
          numeric
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [key]: Number(v) })}
        />
      ))}
      <Choice
        label="Address convention: 0 = wire / 1 = one-based"
        value={value.addressBase}
        options={[0, 1]}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, addressBase: Number(v) as 0 | 1 })}
      />
      <Choice
        label="Data type"
        value={value.dataType}
        options={['uint16', 'int16', 'uint32', 'int32', 'float32']}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, dataType: v as RegisterFormat['dataType'] })}
      />
      {(['byteOrder', 'wordOrder'] as const).map((key) => (
        <Choice
          key={key}
          label={key === 'byteOrder' ? 'Byte order' : 'Word order'}
          value={value[key]}
          options={['big', 'little']}
          disabled={disabled}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
      <Description>
        Physical value = decoded register × scale + offset. No implicit register-prefix conversion.
      </Description>
    </div>
  );
}
export function ModbusProfileForm({
  value,
  onChange,
  isDisabled = false,
  showIdentifiers = true,
}: {
  value: ModbusProfile;
  onChange: (value: ModbusProfile) => void;
  isDisabled?: boolean;
  showIdentifiers?: boolean;
}) {
  const readonly = isDisabled || BUILTIN_MODBUS_PROFILES.includes(value);
  return (
    <section className="wg:flex wg:flex-col wg:gap-4">
      <header>
        <h3>{value.name}</h3>
        <p>
          {readonly
            ? 'Read-only profile. Duplicate to customize. Hardware qualification has not been established.'
            : 'Custom register map — verify against the device manual before use.'}
        </p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-4">
        {showIdentifiers && (
          <Field
            label="Profile ID"
            value={value.id}
            disabled={readonly}
            onChange={(id) => onChange({ ...value, id })}
          />
        )}
        <Field
          label="Profile name"
          value={value.name}
          disabled={readonly}
          onChange={(name) => onChange({ ...value, name })}
        />
        <Field
          label="Version"
          value={value.version}
          numeric
          disabled={readonly}
          onChange={(v) => onChange({ ...value, version: Number(v) })}
        />
        {value.measurements.map((m, index) => {
          const update = (patch: Partial<typeof m>) =>
            onChange({
              ...value,
              measurements: value.measurements.map((item, i) => (i === index ? { ...item, ...patch } : item)),
            });
          return (
            <section key={index} className="wg:flex wg:flex-col wg:gap-3">
              <h4>Measurement: {m.name}</h4>
              <div className="wg:flex wg:flex-col wg:gap-3">
                {showIdentifiers && (
                  <Field label="Measurement ID" value={m.id} disabled={readonly} onChange={(id) => update({ id })} />
                )}
                <Field label="Name" value={m.name} disabled={readonly} onChange={(name) => update({ name })} />
                <Choice
                  label="Read function"
                  value={m.functionCode}
                  options={[3, 4]}
                  disabled={readonly}
                  onChange={(v) => update({ functionCode: Number(v) as 3 | 4 })}
                />
                <FormatFields value={m} disabled={readonly} onChange={update} />
                <Choice
                  label="Physical unit"
                  value={m.unit}
                  options={['ampere', 'volt', 'watt', 'watt-hour', 'percent']}
                  disabled={readonly}
                  onChange={(v) => update({ unit: v as typeof m.unit })}
                />
                <Choice
                  label="Measurement kind"
                  value={m.kind}
                  options={['live', 'cumulative']}
                  disabled={readonly}
                  onChange={(v) => {
                    update({ kind: v as typeof m.kind, rollover: v === 'live' ? undefined : m.rollover });
                  }}
                />
                <Field
                  label="Polling interval (ms)"
                  value={m.pollIntervalMs}
                  numeric
                  disabled={readonly}
                  onChange={(v) => update({ pollIntervalMs: Number(v) })}
                />
                {m.kind === 'cumulative' && (
                  <Field
                    label="Documented raw rollover modulus (blank = fault on decrease)"
                    allowEmpty
                    value={m.rollover ?? ''}
                    numeric
                    disabled={readonly}
                    onChange={(v) => update({ rollover: v === '' ? undefined : Number(v) })}
                  />
                )}
                <Button
                  isDisabled={readonly}
                  variant="danger"
                  onPress={() => onChange({ ...value, measurements: value.measurements.filter((_, i) => i !== index) })}
                >
                  Remove measurement
                </Button>
              </div>
            </section>
          );
        })}
        <Button
          isDisabled={readonly}
          variant="secondary"
          onPress={() =>
            onChange({
              ...value,
              measurements: [
                ...value.measurements,
                {
                  ...emptyFormat,
                  id: crypto.randomUUID(),
                  name: 'Measurement',
                  functionCode: 3,
                  unit: 'watt',
                  kind: 'live',
                  pollIntervalMs: 5000,
                },
              ],
            })
          }
        >
          Add measurement
        </Button>
        {value.actions.map((a, index) => {
          const update = (patch: Partial<typeof a>) =>
            onChange({
              ...value,
              actions: value.actions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
            });
          return (
            <section key={index} className="wg:flex wg:flex-col wg:gap-3">
              <h4>Action: {a.name}</h4>
              <div className="wg:flex wg:flex-col wg:gap-3">
                {showIdentifiers && (
                  <Field label="Action ID" value={a.id} disabled={readonly} onChange={(id) => update({ id })} />
                )}
                <Field label="Name" value={a.name} disabled={readonly} onChange={(name) => update({ name })} />
                <Choice
                  label="Write function: 5 coil / 6 register / 16 registers"
                  value={a.functionCode}
                  options={[5, 6, 16]}
                  disabled={readonly}
                  onChange={(v) => update({ functionCode: Number(v) as 5 | 6 | 16 })}
                />
                <FormatFields value={a} disabled={readonly} onChange={update} />
                <Field
                  label="On value (physical units)"
                  value={a.onValue}
                  numeric
                  disabled={readonly}
                  onChange={(v) => update({ onValue: Number(v) })}
                />
                <Field
                  label="Off value (physical units)"
                  value={a.offValue}
                  numeric
                  disabled={readonly}
                  onChange={(v) => update({ offValue: Number(v) })}
                />
                <Button
                  isDisabled={readonly}
                  variant="danger"
                  onPress={() => onChange({ ...value, actions: value.actions.filter((_, i) => i !== index) })}
                >
                  Remove action
                </Button>
              </div>
            </section>
          );
        })}
        <Button
          isDisabled={readonly}
          variant="secondary"
          onPress={() =>
            onChange({
              ...value,
              actions: [
                ...value.actions,
                { ...emptyFormat, id: crypto.randomUUID(), name: 'Switch', functionCode: 5, onValue: 1, offValue: 0 },
              ],
            })
          }
        >
          Add action
        </Button>
      </div>
    </section>
  );
}

export function ModbusConfigurationForm({
  value,
  onChange,
  isDisabled = false,
  showIdentifiers = true,
  collapseProfiles = false,
  showValidationErrors = true,
}: ModbusConfigurationFormProps) {
  const [openProfiles, setOpenProfiles] = useState<Set<number>>(new Set());
  const errors = validateModbus(value);
  const profiles = [...BUILTIN_MODBUS_PROFILES, ...value.profiles];
  return (
    <section aria-label="Modbus configuration" className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4">
      <p>No hardware is qualified. Built-in maps are unverified manual-derived candidates; no rollover is assumed.</p>
      {value.connections.map((c, index) => {
        const update = (patch: object) =>
          onChange({
            ...value,
            connections: value.connections.map((item, i) => (i === index ? { ...item, ...patch } : item)),
          });
        return (
          <section key={index} className="wg:flex wg:flex-col wg:gap-3">
            <h3>
              Connection {index + 1}: {c.transport === 'tcp' ? c.host || 'TCP' : c.path}
            </h3>
            <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
              {showIdentifiers && (
                <Field label="Connection ID" value={c.id} disabled={isDisabled} onChange={(id) => update({ id })} />
              )}
              <Choice
                label="Transport"
                value={c.transport}
                options={['tcp', 'rtu']}
                disabled={isDisabled}
                onChange={(v) =>
                  onChange({
                    ...value,
                    connections: value.connections.map((item, i) =>
                      i === index
                        ? {
                            id: c.id,
                            timeoutMs: c.timeoutMs,
                            reconnectMs: c.reconnectMs,
                            queueLimit: c.queueLimit,
                            ...(v === 'tcp'
                              ? { transport: 'tcp' as const, host: '', port: 502 }
                              : {
                                  transport: 'rtu' as const,
                                  path: '/dev/serial',
                                  baudRate: 19200,
                                  parity: 'even' as const,
                                  stopBits: 1 as const,
                                }),
                          }
                        : item,
                    ),
                  })
                }
              />
              {c.transport === 'tcp' ? (
                <>
                  <Field label="Host" value={c.host} disabled={isDisabled} onChange={(host) => update({ host })} />
                  <Field
                    label="Port"
                    value={c.port}
                    numeric
                    disabled={isDisabled}
                    onChange={(v) => update({ port: Number(v) })}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Serial device path"
                    value={c.path}
                    disabled={isDisabled}
                    onChange={(path) => update({ path })}
                  />
                  <Choice
                    label="Baud rate"
                    value={c.baudRate}
                    options={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]}
                    disabled={isDisabled}
                    onChange={(v) => update({ baudRate: Number(v) })}
                  />
                  <Choice
                    label="Parity"
                    value={c.parity}
                    options={['none', 'even', 'odd']}
                    disabled={isDisabled}
                    onChange={(parity) => update({ parity })}
                  />
                  <Choice
                    label="Stop bits"
                    value={c.stopBits}
                    options={[1, 2]}
                    disabled={isDisabled}
                    onChange={(v) => update({ stopBits: Number(v) })}
                  />
                </>
              )}
              {(['timeoutMs', 'reconnectMs', 'queueLimit'] as const).map((key) => (
                <Field
                  key={key}
                  label={
                    {
                      timeoutMs: 'Response timeout (ms)',
                      reconnectMs: 'Reconnect delay (ms)',
                      queueLimit: 'Queue limit',
                    }[key]
                  }
                  value={c[key]}
                  numeric
                  disabled={isDisabled}
                  onChange={(v) => update({ [key]: Number(v) })}
                />
              ))}
              <Button
                isDisabled={isDisabled}
                variant="danger"
                onPress={() => onChange({ ...value, connections: value.connections.filter((_, i) => i !== index) })}
              >
                Remove connection
              </Button>
            </div>
          </section>
        );
      })}
      <Button
        isDisabled={isDisabled}
        variant="secondary"
        onPress={() =>
          onChange({
            ...value,
            connections: [
              ...value.connections,
              {
                id: crypto.randomUUID(),
                transport: 'tcp',
                host: '',
                port: 502,
                timeoutMs: 1000,
                reconnectMs: 250,
                queueLimit: 16,
              },
            ],
          })
        }
      >
        Add connection
      </Button>
      {value.devices.map((d, index) => {
        const update = (patch: Partial<typeof d>) =>
          onChange({ ...value, devices: value.devices.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
        return (
          <section key={index} className="wg:flex wg:flex-col wg:gap-3">
            <h3>Device: {d.name}</h3>
            <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
              {showIdentifiers && (
                <Field label="Device ID" value={d.id} disabled={isDisabled} onChange={(id) => update({ id })} />
              )}
              <Field label="Device name" value={d.name} disabled={isDisabled} onChange={(name) => update({ name })} />
              <Choice
                label="Connection"
                value={d.connectionId}
                options={value.connections.map((c) => c.id)}
                labels={Object.fromEntries(
                  value.connections.map((c, i) => [
                    c.id,
                    `Connection ${i + 1}: ${c.transport === 'tcp' ? c.host || 'TCP' : c.path}`,
                  ]),
                )}
                disabled={isDisabled}
                onChange={(connectionId) => update({ connectionId })}
              />
              <Field
                label="Unit ID (1–247)"
                value={d.unitId}
                numeric
                disabled={isDisabled}
                onChange={(v) => update({ unitId: Number(v) })}
              />
              <Select
                isDisabled={isDisabled}
                value={`${d.profileId}@${d.profileVersion}`}
                onChange={(key) => {
                  const p = profiles.find((p) => `${p.id}@${p.version}` === key);
                  if (p) update({ profileId: p.id, profileVersion: p.version });
                }}
              >
                <Label>Device profile</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {profiles.map((p) => (
                      <ListBox.Item key={`${p.id}@${p.version}`} id={`${p.id}@${p.version}`} textValue={p.name}>
                        {p.name} v{p.version}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Button
                isDisabled={isDisabled}
                variant="danger"
                onPress={() => onChange({ ...value, devices: value.devices.filter((_, i) => i !== index) })}
              >
                Remove device
              </Button>
            </div>
          </section>
        );
      })}
      <Button
        isDisabled={isDisabled}
        variant="secondary"
        onPress={() =>
          onChange({
            ...value,
            devices: [
              ...value.devices,
              {
                id: crypto.randomUUID(),
                name: 'Modbus device',
                connectionId: value.connections[0]?.id ?? '',
                unitId: 1,
                profileId: profiles[0].id,
                profileVersion: profiles[0].version,
              },
            ],
          })
        }
      >
        Add device
      </Button>
      {profiles.map((p, profileIndex) => (
        // Profiles are appended and edited in place; the editable ID must not control mount identity.
        <details
          key={profileIndex}
          open={!collapseProfiles || openProfiles.has(profileIndex)}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setOpenProfiles((current) => {
              const next = new Set(current);
              if (open) next.add(profileIndex);
              else next.delete(profileIndex);
              return next;
            });
          }}
        >
          <summary className="wg:whitespace-normal wg:break-words">
            {p.name} v{p.version}
          </summary>
          {(!collapseProfiles || openProfiles.has(profileIndex)) && (
            <ModbusProfileForm
              value={p}
              showIdentifiers={showIdentifiers}
              isDisabled={isDisabled}
              onChange={(updated) =>
                onChange({
                  ...value,
                  profiles: value.profiles.map((item, i) =>
                    i === profileIndex - BUILTIN_MODBUS_PROFILES.length ? updated : item,
                  ),
                })
              }
            />
          )}
          <Button
            className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
            isDisabled={isDisabled}
            variant="secondary"
            onPress={() =>
              onChange({ ...value, profiles: [...value.profiles, duplicateProfile(p, crypto.randomUUID())] })
            }
          >
            Duplicate {p.name}
          </Button>
        </details>
      ))}
      <Button
        isDisabled={isDisabled}
        variant="secondary"
        onPress={() =>
          onChange({
            ...value,
            profiles: [
              ...value.profiles,
              { id: crypto.randomUUID(), name: 'Custom profile', version: 1, measurements: [], actions: [] },
            ],
          })
        }
      >
        Create custom profile
      </Button>
      {showValidationErrors && errors.length > 0 && (
        <ul role="alert">
          {errors.map((error, i) => (
            <li key={i}>
              {error.path}: {error.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
