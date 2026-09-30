// PROTOTYPE — Variant B "Device browser": hardware list on the left, each device has a Live tab and a Setup tab.
import { Button, Chip, Tabs } from '@heroui/react';
import { Cpu, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
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

export function VariantB() {
  const config = useConfig();
  const live = useLive();
  const [selected, setSelected] = useState('cc100');
  const [tab, setTab] = useState<string>('live');
  const device = config.devices.find((d) => d.id === selected);

  return (
    <div className="wg:flex wg:flex-col wg:gap-4">
      <ApplyBar />
      <div className="wg:grid wg:gap-6 wg:md:grid-cols-[16rem_1fr]">
        <nav className="wg:flex wg:flex-col wg:gap-1" aria-label="Hardware">
          <p className="wg:px-3 wg:text-xs wg:font-medium wg:uppercase wg:text-muted">Controller</p>
          <NavItem active={selected === 'cc100'} onPress={() => setSelected('cc100')} label="CC100 onboard" sub="4 outputs · 8 inputs" online />
          <p className="wg:mt-4 wg:px-3 wg:text-xs wg:font-medium wg:uppercase wg:text-muted">Modbus devices</p>
          {config.devices.map((d) => (
            <NavItem key={d.id} active={selected === d.id} onPress={() => setSelected(d.id)} label={d.name} sub={linkLabel(d.link)} online={live.deviceOnline[d.id]} />
          ))}
          <Button
            variant="ghost"
            className="wg:justify-start"
            onPress={() => {
              setSelected(addDevice());
              setTab('setup');
            }}
          >
            <Plus className="wg:size-4" /> Add device
          </Button>
        </nav>

        <section className="wg:min-w-0">
          <header className="wg:mb-3 wg:flex wg:items-center wg:gap-3">
            <Cpu className="wg:size-6 wg:text-muted" />
            <div>
              <h2 className="wg:text-xl wg:font-semibold">{device?.name ?? 'CC100 onboard'}</h2>
              <p className="wg:text-sm wg:text-muted">{device ? `${profileOf(device)?.name} · ${linkLabel(device.link)}` : 'Digital terminals on the controller itself'}</p>
            </div>
          </header>
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
            <Tabs.ListContainer>
              <Tabs.List aria-label="View">
                <Tabs.Tab id="live">
                  Live
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="setup">
                  Setup
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>

            <Tabs.Panel id="live" className="wg:pt-4">
              {device ? (
                <Rows>
                  {!live.deviceOnline[device.id] && <p className="wg:py-2 wg:text-sm wg:text-danger">Device not responding — values are stale.</p>}
                  {profileOf(device)?.measurements.map((m) => (
                    <Row key={m.id} name={m.name} meta="value">
                      <span className="wg:font-semibold wg:tabular-nums">{fmt(live.modbus[`${device.id}/${m.id}`], m.unit)}</span>
                    </Row>
                  ))}
                  {profileOf(device)?.actions.map((a) => (
                    <Row key={a.id} name={a.name} meta="switch">
                      <Toggle label={a.name} on={!!live.modbus[`${device.id}/${a.id}`]} onChange={(v) => setModbusAction(device.id, a.id, v)} />
                    </Row>
                  ))}
                </Rows>
              ) : (
                <Rows>
                  {config.outputs
                    .filter((o) => o.name)
                    .map((o) => (
                      <Row key={o.terminal} name={o.name} meta={o.terminal}>
                        {o.mode === 'pulse' ? (
                          <Button size="sm" variant={live.do[o.terminal] ? 'primary' : 'secondary'} onPress={() => setOutput(o.terminal, true)}>
                            <Zap className="wg:size-4" /> Pulse {o.pulseMs / 1000}s
                          </Button>
                        ) : (
                          <Toggle label={o.name} on={!!live.do[o.terminal]} onChange={(v) => setOutput(o.terminal, v)} />
                        )}
                      </Row>
                    ))}
                  {config.inputs
                    .filter((i) => i.name)
                    .map((i) => (
                      <Row key={i.terminal} name={i.name} meta={i.terminal}>
                        <span className="wg:flex wg:items-center wg:gap-2 wg:text-sm">
                          <Led on={!!live.di[i.terminal] !== i.invert} /> {!!live.di[i.terminal] !== i.invert ? 'Active' : 'Inactive'}
                        </span>
                      </Row>
                    ))}
                  <p className="wg:pt-3 wg:text-sm wg:text-muted">Only named terminals are shown. Name more under Setup.</p>
                </Rows>
              )}
            </Tabs.Panel>

            <Tabs.Panel id="setup" className="wg:flex wg:max-w-2xl wg:flex-col wg:gap-6 wg:pt-4">
              {device ? (
                <DeviceForm
                  device={device}
                  onRemove={() => {
                    removeDevice(device.id);
                    setSelected('cc100');
                  }}
                />
              ) : (
                <>
                  <h3 className="wg:font-semibold">Outputs</h3>
                  {config.outputs.map((o) => (
                    <details key={o.terminal} className="wg:rounded-lg wg:bg-surface-secondary wg:p-3">
                      <summary className="wg:cursor-pointer">
                        <Chip size="sm" variant="soft">
                          {o.terminal}
                        </Chip>{' '}
                        {o.name || <span className="wg:text-muted">Unused</span>}
                      </summary>
                      <div className="wg:pt-3">
                        <OutputForm output={o} />
                      </div>
                    </details>
                  ))}
                  <h3 className="wg:font-semibold">Inputs</h3>
                  <div className="wg:grid wg:grid-cols-2 wg:gap-3">
                    {config.inputs.map((i) => (
                      <Text key={i.terminal} label={i.terminal} value={i.name} placeholder="Unused" onChange={(name) => updateInput(i.terminal, { name })} />
                    ))}
                  </div>
                  <h3 className="wg:font-semibold">RS-485 port</h3>
                  <BusForm />
                </>
              )}
            </Tabs.Panel>
          </Tabs>
        </section>
      </div>
    </div>
  );
}

function NavItem({ active, onPress, label, sub, online }: { active: boolean; onPress: () => void; label: string; sub: string; online: boolean }) {
  return (
    <Button variant={active ? 'secondary' : 'ghost'} className="wg:h-auto wg:justify-start wg:py-2" onPress={onPress}>
      <Led on={online} offline={!online} />
      <span className="wg:flex wg:min-w-0 wg:flex-col wg:items-start">
        <span className="wg:truncate">{label}</span>
        <span className="wg:truncate wg:text-xs wg:font-normal wg:text-muted">{sub}</span>
      </span>
    </Button>
  );
}
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="wg:flex wg:flex-col wg:divide-y wg:divide-border">{children}</div>;
}
function Row({ name, meta, children }: { name: string; meta: string; children: React.ReactNode }) {
  return (
    <div className="wg:flex wg:min-h-14 wg:items-center wg:justify-between wg:gap-4">
      <div>
        <p>{name}</p>
        <p className="wg:text-xs wg:text-muted">{meta}</p>
      </div>
      {children}
    </div>
  );
}
