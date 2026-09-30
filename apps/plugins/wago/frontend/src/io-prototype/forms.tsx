// PROTOTYPE — throwaway. Field-level widgets shared by the variants (layouts are NOT shared).
import { Alert, Button, Input, Label, ListBox, Select, Switch, TextField } from '@heroui/react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { ModbusProfile } from '../../../modbus/model';
import {
  allProfiles,
  apply,
  discard,
  releaseOverrides,
  useDirty,
  useLive,
  disconnectLabel,
  isBuiltin,
  profileOf,
  setConfig,
  updateDevice,
  updateOutput,
  upsertProfile,
  useConfig,
  type Device,
  type Output,
} from './store';

export function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
}) {
  return (
    <Select value={value} onChange={(k) => k !== null && onChange(String(k) as T)}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map(([id, text]) => (
            <ListBox.Item key={id} id={id} textValue={text}>
              {text}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function Text({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <TextField>
      <Label>{label}</Label>
      <Input type={type} value={String(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </TextField>
  );
}

export function OutputForm({ output }: { output: Output }) {
  const set = (p: Partial<Output>) => updateOutput(output.terminal, p);
  return (
    <div className="wg:flex wg:flex-col wg:gap-4">
      <Text label="Name" value={output.name} placeholder="Unused" onChange={(name) => set({ name })} />
      <Pick
        label="When a flow turns it on"
        value={output.mode}
        options={[
          ['switch', 'Stay on until turned off'],
          ['pulse', 'Pulse, then turn off automatically'],
        ]}
        onChange={(mode) => set({ mode })}
      />
      {output.mode === 'pulse' && (
        <Text label="Pulse length (seconds)" type="number" value={output.pulseMs / 1000} onChange={(v) => set({ pulseMs: Number(v) * 1000 })} />
      )}
      <Pick
        label="If Attraccess is unreachable"
        value={output.onDisconnect}
        options={Object.entries(disconnectLabel) as Array<[Output['onDisconnect'], string]>}
        onChange={(onDisconnect) => set({ onDisconnect })}
      />
      {output.onDisconnect === 'timeout' && (
        <Text label="Timeout (seconds)" type="number" value={output.timeoutMs / 1000} onChange={(v) => set({ timeoutMs: Number(v) * 1000 })} />
      )}
    </div>
  );
}

export function DeviceForm({ device, onRemove }: { device: Device; onRemove?: () => void }) {
  useConfig();
  const profile = profileOf(device);
  const set = (p: Partial<Device>) => updateDevice(device.id, p);
  const link = device.link;
  return (
    <div className="wg:flex wg:flex-col wg:gap-4">
      <Text label="Name" value={device.name} onChange={(name) => set({ name })} />
      <Pick
        label="Device type"
        value={device.profileId}
        options={allProfiles().map((p) => [p.id, p.name])}
        onChange={(profileId) => set({ profileId })}
      />
      <Pick
        label="Connected via"
        value={link.kind}
        options={[
          ['rs485', 'CC100 RS-485 port'],
          ['tcp', 'Network (Modbus TCP)'],
        ]}
        onChange={(kind) =>
          set({ link: kind === 'rs485' ? { kind, unitId: link.unitId } : { kind, host: '', port: 502, unitId: link.unitId } })
        }
      />
      <div className="wg:grid wg:grid-cols-2 wg:gap-3">
        {link.kind === 'tcp' && (
          <>
            <Text label="Host / IP" value={link.host} onChange={(host) => set({ link: { ...link, host } })} />
            <Text label="Port" type="number" value={link.port} onChange={(v) => set({ link: { ...link, port: Number(v) } })} />
          </>
        )}
        <Text
          label={link.kind === 'rs485' ? 'Modbus address' : 'Unit ID'}
          type="number"
          value={link.unitId}
          onChange={(v) => set({ link: { ...link, unitId: Number(v) } })}
        />
        <Text label="Read every (s)" type="number" value={device.pollMs / 1000} onChange={(v) => set({ pollMs: Number(v) * 1000 })} />
      </div>
      {profile && <ProfileEditor profile={profile} onCustomize={(p) => set({ profileId: p.id })} />}
      {onRemove && (
        <Button variant="danger" size="sm" onPress={onRemove}>
          <Trash2 className="wg:size-4" /> Remove device
        </Button>
      )}
    </div>
  );
}

/** Built-ins are read-only; "Customize" forks them. Advanced register fields (byte/word order, FC, base) skipped. */
export function ProfileEditor({ profile, onCustomize }: { profile: ModbusProfile; onCustomize: (p: ModbusProfile) => void }) {
  const builtin = isBuiltin(profile.id);
  const save = (p: ModbusProfile) => upsertProfile(p);
  return (
    <div className="wg:flex wg:flex-col wg:gap-2">
      <div className="wg:flex wg:items-center wg:justify-between">
        <p className="wg:text-sm wg:font-medium">Registers {builtin && <span className="wg:text-muted">(built-in, read-only)</span>}</p>
        {builtin && (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => {
              const copy = { ...structuredClone(profile), id: `custom-${Date.now()}`, name: `${profile.name} (custom)` } as ModbusProfile;
              save(copy);
              onCustomize(copy);
            }}
          >
            <Copy className="wg:size-4" /> Customize
          </Button>
        )}
      </div>
      <div className="wg:flex wg:flex-col wg:gap-1 wg:text-sm">
        {profile.measurements.map((m, i) => (
          <div key={m.id} className="wg:grid wg:grid-cols-[1fr_5rem_5rem_4rem] wg:items-center wg:gap-2">
            {builtin ? (
              <>
                <span>{m.name}</span>
                <span className="wg:text-muted">0x{m.address.toString(16)}</span>
                <span className="wg:text-muted">{m.dataType}</span>
                <span className="wg:text-muted">{m.unit}</span>
              </>
            ) : (
              <>
                <Input
                  aria-label="Name"
                  value={m.name}
                  onChange={(e) => {
                    const measurements = profile.measurements.map((x, j) => (j === i ? { ...x, name: e.target.value } : x));
                    save({ ...profile, measurements });
                  }}
                />
                <Input
                  aria-label="Address"
                  value={m.address}
                  onChange={(e) => {
                    const measurements = profile.measurements.map((x, j) => (j === i ? { ...x, address: Number(e.target.value) } : x));
                    save({ ...profile, measurements });
                  }}
                />
                <span className="wg:text-muted">{m.dataType}</span>
                <span className="wg:text-muted">{m.unit}</span>
              </>
            )}
          </div>
        ))}
        {profile.actions.map((a) => (
          <div key={a.id} className="wg:grid wg:grid-cols-[1fr_5rem_5rem_4rem] wg:gap-2">
            <span>{a.name}</span>
            <span className="wg:text-muted">coil {a.address}</span>
            <span className="wg:text-muted">switch</span>
            <span />
          </div>
        ))}
      </div>
      {!builtin && (
        <div className="wg:flex wg:gap-2">
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              save({
                ...profile,
                measurements: [
                  ...profile.measurements,
                  { ...(profile.measurements[0] ?? relayTemplate), id: `m-${Date.now()}`, name: 'New value', address: 0 },
                ],
              })
            }
          >
            <Plus className="wg:size-4" /> Value
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() =>
              save({
                ...profile,
                actions: [
                  ...profile.actions,
                  { ...relayTemplate, id: `a-${Date.now()}`, name: `Switch ${profile.actions.length + 1}`, functionCode: 5, onValue: 1, offValue: 0, address: profile.actions.length },
                ],
              })
            }
          >
            <Plus className="wg:size-4" /> Switch
          </Button>
        </div>
      )}
    </div>
  );
}
const relayTemplate = {
  address: 0,
  addressBase: 0 as const,
  dataType: 'uint16' as const,
  byteOrder: 'big' as const,
  wordOrder: 'big' as const,
  scale: 1,
  offset: 0,
  functionCode: 3 as const,
  unit: 'percent' as const,
  kind: 'live' as const,
  pollIntervalMs: 5000,
};

export function BusForm() {
  const { bus } = useConfig();
  const set = (p: Partial<typeof bus>) => setConfig((c) => ({ ...c, bus: { ...c.bus, ...p } }));
  return (
    <div className="wg:grid wg:grid-cols-3 wg:gap-3">
      <Pick
        label="Baud rate"
        value={String(bus.baudRate)}
        options={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => [String(b), String(b)])}
        onChange={(v) => set({ baudRate: Number(v) })}
      />
      <Pick label="Parity" value={bus.parity} options={[['none', 'None'], ['even', 'Even'], ['odd', 'Odd']]} onChange={(parity) => set({ parity })} />
      <Pick label="Stop bits" value={String(bus.stopBits) as '1' | '2'} options={[['1', '1'], ['2', '2']]} onChange={(v) => set({ stopBits: Number(v) as 1 | 2 })} />
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Switch isSelected={on} onChange={onChange} isDisabled={disabled} aria-label={label}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

export function Led({ on, offline }: { on: boolean; offline?: boolean }) {
  return (
    <span
      aria-label={offline ? 'offline' : on ? 'on' : 'off'}
      className={`wg:inline-block wg:size-3 wg:shrink-0 wg:rounded-full ${offline ? 'wg:bg-danger' : on ? 'wg:bg-success' : 'wg:bg-default'}`}
    />
  );
}

export function ApplyBar() {
  const dirty = useDirty();
  const { overrides } = useLive();
  return (
    <div className="wg:flex wg:flex-col wg:gap-2">
      {overrides.length > 0 && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Manual control active on {overrides.length} output(s)</Alert.Title>
            <Alert.Description>Flows will take over again with their next command.</Alert.Description>
          </Alert.Content>
          <Button size="sm" variant="secondary" onPress={releaseOverrides}>
            Release
          </Button>
        </Alert>
      )}
      {dirty && (
        <Alert status="accent">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Unapplied changes</Alert.Title>
            <Alert.Description>Live control uses the configuration currently on the controller.</Alert.Description>
          </Alert.Content>
          <Button size="sm" variant="ghost" onPress={discard}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onPress={apply}>
            Apply to controller
          </Button>
        </Alert>
      )}
    </div>
  );
}
