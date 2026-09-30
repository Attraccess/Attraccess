// PROTOTYPE — Variant A "Front panel": the live view IS the config UI. Click anything to configure it in a drawer.
import { Button, Card, Chip } from '@heroui/react';
import { Cable, Plus, Settings2, Zap } from 'lucide-react';
import { useState } from 'react';
import { StandardDrawer } from '../drawer';
import { ApplyBar, BusForm, DeviceForm, Led, OutputForm, Text, Toggle } from './forms';
import {
  addDevice,
  fmt,
  linkLabel,
  profileOf,
  removeDevice,
  setModbusAction,
  setOutput,
  updateInput,
  useConfig,
  useLive,
} from './store';

type Open = { kind: 'output' | 'input'; terminal: string } | { kind: 'device'; id: string } | { kind: 'bus' } | null;

export function VariantA() {
  const config = useConfig();
  const live = useLive();
  const [open, setOpen] = useState<Open>(null);
  const output = open?.kind === 'output' ? config.outputs.find((o) => o.terminal === open.terminal) : undefined;
  const input = open?.kind === 'input' ? config.inputs.find((o) => o.terminal === open.terminal) : undefined;
  const device = open?.kind === 'device' ? config.devices.find((d) => d.id === open.id) : undefined;

  return (
    <div className="wg:flex wg:flex-col wg:gap-5">
      <ApplyBar />
      <Card>
        <Card.Header className="wg:flex-row wg:items-center wg:justify-between">
          <div>
            <Card.Title>CC100 onboard I/O</Card.Title>
            <Card.Description>Click a terminal to name or configure it. Unnamed terminals are unused.</Card.Description>
          </div>
          <Button size="sm" variant="ghost" onPress={() => setOpen({ kind: 'bus' })}>
            <Cable className="wg:size-4" /> RS-485 port · {config.bus.baudRate} {config.bus.parity[0].toUpperCase()}
            {config.bus.stopBits}
          </Button>
        </Card.Header>
        <Card.Content className="wg:grid wg:gap-6 wg:md:grid-cols-2">
          <section>
            <h3 className="wg:mb-2 wg:text-sm wg:font-medium wg:text-muted">Outputs</h3>
            <div className="wg:grid wg:grid-cols-2 wg:gap-2">
              {config.outputs.map((o) => (
                <Card
                  key={o.terminal}
                  variant="secondary"
                  className={`wg:cursor-pointer wg:hover:bg-surface-tertiary ${o.name ? '' : 'wg:opacity-50'}`}
                  onClick={() => setOpen({ kind: 'output', terminal: o.terminal })}
                >
                  <Card.Content className="wg:gap-2">
                    <div className="wg:flex wg:items-center wg:justify-between">
                      <Chip size="sm" variant="soft">
                        {o.terminal}
                      </Chip>
                      {/* ponytail: stop tile click so live control doesn't also open settings */}
                      <div className="wg:flex wg:items-center wg:gap-1" onClick={(e) => e.stopPropagation()}>
                        {o.name &&
                          (o.mode === 'pulse' ? (
                            <Button size="sm" variant={live.do[o.terminal] ? 'primary' : 'secondary'} onPress={() => setOutput(o.terminal, true)}>
                              <Zap className="wg:size-4" /> Pulse
                            </Button>
                          ) : (
                            <Toggle label={o.name} on={!!live.do[o.terminal]} onChange={(v) => setOutput(o.terminal, v)} />
                          ))}
                        <Button isIconOnly size="sm" variant="ghost" aria-label={`Configure ${o.terminal}`} onPress={() => setOpen({ kind: 'output', terminal: o.terminal })}>
                          <Settings2 className="wg:size-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="wg:font-medium">{o.name || 'Unused — name it'}</p>
                    <p className="wg:text-xs wg:text-muted">
                      {o.mode === 'pulse' ? `Pulse ${o.pulseMs / 1000}s` : 'On/off'} · {live.overrides.includes(o.terminal) ? 'manual' : 'flow'}
                    </p>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </section>
          <section>
            <h3 className="wg:mb-2 wg:text-sm wg:font-medium wg:text-muted">Inputs</h3>
            <div className="wg:grid wg:grid-cols-2 wg:gap-2">
              {config.inputs.map((i) => (
                <button
                  key={i.terminal}
                  onClick={() => setOpen({ kind: 'input', terminal: i.terminal })}
                  aria-label={`Configure ${i.terminal}`}
                  className={`wg:flex wg:cursor-pointer wg:items-center wg:gap-2 wg:rounded-lg wg:bg-surface-secondary wg:p-3 wg:text-left wg:hover:bg-surface-tertiary ${i.name ? '' : 'wg:opacity-50'}`}
                >
                  <Led on={!!i.name && !!live.di[i.terminal] !== i.invert} />
                  <span className="wg:text-xs wg:text-muted">{i.terminal}</span>
                  <span className="wg:flex-1 wg:truncate wg:text-sm">{i.name || 'Unused — name it'}</span>
                  <Settings2 className="wg:size-4 wg:shrink-0 wg:text-muted" />
                </button>
              ))}
            </div>
          </section>
        </Card.Content>
      </Card>

      <div className="wg:grid wg:gap-4 wg:md:grid-cols-2 wg:xl:grid-cols-3">
        {config.devices.map((d) => {
          const p = profileOf(d);
          const online = live.deviceOnline[d.id];
          return (
            <Card key={d.id}>
              <Card.Header className="wg:flex-row wg:items-start wg:justify-between">
                <div>
                  <Card.Title className="wg:flex wg:items-center wg:gap-2">
                    <Led on={online} offline={!online} /> {d.name}
                  </Card.Title>
                  <Card.Description>
                    {p?.name} · {linkLabel(d.link)}
                  </Card.Description>
                </div>
                <Button isIconOnly size="sm" variant="ghost" aria-label="Configure" onPress={() => setOpen({ kind: 'device', id: d.id })}>
                  <Settings2 className="wg:size-4" />
                </Button>
              </Card.Header>
              <Card.Content className="wg:gap-2">
                {!online && <p className="wg:text-sm wg:text-danger">No response from address {d.link.unitId}. Check wiring and address.</p>}
                {p?.measurements.map((m) => (
                  <div key={m.id} className="wg:flex wg:items-baseline wg:justify-between">
                    <span className="wg:text-sm wg:text-muted">{m.name}</span>
                    <span className="wg:text-xl wg:font-semibold wg:tabular-nums">{fmt(live.modbus[`${d.id}/${m.id}`], m.unit)}</span>
                  </div>
                ))}
                {p?.actions.map((a) => (
                  <div key={a.id} className="wg:flex wg:items-center wg:justify-between">
                    <span className="wg:text-sm">{a.name}</span>
                    <Toggle label={a.name} disabled={!online} on={!!live.modbus[`${d.id}/${a.id}`]} onChange={(v) => setModbusAction(d.id, a.id, v)} />
                  </div>
                ))}
              </Card.Content>
            </Card>
          );
        })}
        <Button variant="outline" className="wg:h-auto wg:min-h-32" onPress={() => setOpen({ kind: 'device', id: addDevice() })}>
          <Plus className="wg:size-5" /> Add Modbus device
        </Button>
      </div>

      <StandardDrawer isOpen={!!open} onOpenChange={(v) => !v && setOpen(null)} ariaLabel="Configure">
        <div className="wg:flex wg:flex-col wg:gap-4 wg:p-6">
          {output && (
            <>
              <h2 className="wg:text-xl wg:font-semibold">Output {output.terminal}</h2>
              <OutputForm output={output} />
            </>
          )}
          {input && (
            <>
              <h2 className="wg:text-xl wg:font-semibold">Input {input.terminal}</h2>
              <Text label="Name" value={input.name} placeholder="Unused" onChange={(name) => updateInput(input.terminal, { name })} />
              <Toggle label="Invert" on={input.invert} onChange={(invert) => updateInput(input.terminal, { invert })} />
              <span className="wg:text-sm wg:text-muted">Invert signal (active when no voltage)</span>
            </>
          )}
          {device && (
            <>
              <h2 className="wg:text-xl wg:font-semibold">{device.name}</h2>
              <DeviceForm
                device={device}
                onRemove={() => {
                  removeDevice(device.id);
                  setOpen(null);
                }}
              />
            </>
          )}
          {open?.kind === 'bus' && (
            <>
              <h2 className="wg:text-xl wg:font-semibold">RS-485 port</h2>
              <p className="wg:text-sm wg:text-muted">Shared by every device on the CC100's serial terminals. All devices on the bus must use these settings.</p>
              <BusForm />
            </>
          )}
          <Button variant="secondary" onPress={() => setOpen(null)}>
            Done
          </Button>
        </div>
      </StandardDrawer>
    </div>
  );
}
