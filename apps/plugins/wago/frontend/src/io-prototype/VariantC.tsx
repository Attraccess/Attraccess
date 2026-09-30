// PROTOTYPE — Variant C "Signals": one flat list of named signals, hardware is secondary.
// Users think "Door lock", not "DO2" or "unit 3 coil 1". Where a signal comes from is just a chip.
import { Button, Card, Chip, Input, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { ChevronDown, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import { ApplyBar, BusForm, DeviceForm, Led, OutputForm, Toggle } from './forms';
import { addDevice, allProfiles, fmt, profileOf, removeDevice, setModbusAction, setOutput, updateInput, updateOutput, useConfig, useLive } from './store';

export function VariantC() {
  const config = useConfig();
  const live = useLive();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showUnused, setShowUnused] = useState(false);
  const [modal, setModal] = useState<{ step: 'pick' } | { step: 'edit'; id: string } | { step: 'bus' } | null>(null);
  const editing = modal?.step === 'edit' ? config.devices.find((d) => d.id === modal.id) : undefined;
  const unused = config.outputs.filter((o) => !o.name).length + config.inputs.filter((i) => !i.name).length;

  return (
    <div className="wg:flex wg:flex-col wg:gap-5">
      <ApplyBar />
      <div className="wg:flex wg:flex-wrap wg:items-center wg:gap-2">
        <span className="wg:text-sm wg:text-muted">Hardware:</span>
        <Chip variant="soft">
          <Led on /> CC100
        </Chip>
        <Button size="sm" variant="ghost" onPress={() => setModal({ step: 'bus' })}>
          RS-485 {config.bus.baudRate}
        </Button>
        {config.devices.map((d) => (
          <Button key={d.id} size="sm" variant="secondary" onPress={() => setModal({ step: 'edit', id: d.id })}>
            <Led on={live.deviceOnline[d.id]} offline={!live.deviceOnline[d.id]} /> {d.name}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onPress={() => setModal({ step: 'pick' })}>
          <Plus className="wg:size-4" /> Add device
        </Button>
      </div>

      <section>
        <h2 className="wg:mb-2 wg:text-lg wg:font-semibold">Outputs</h2>
        <div className="wg:flex wg:flex-col wg:divide-y wg:divide-border">
          {config.outputs
            .filter((o) => showUnused || o.name)
            .map((o) => (
              <div key={o.terminal}>
                <SignalRow
                  name={o.name}
                  onRename={(name) => updateOutput(o.terminal, { name })}
                  source={`CC100 ${o.terminal}`}
                  live={live.overrides.includes(o.terminal) ? 'Manual' : 'Flow'}
                  control={
                    o.mode === 'pulse' ? (
                      <Button size="sm" variant={live.do[o.terminal] ? 'primary' : 'secondary'} onPress={() => setOutput(o.terminal, true)}>
                        <Zap className="wg:size-4" /> Pulse
                      </Button>
                    ) : (
                      <Toggle label={o.name} on={!!live.do[o.terminal]} onChange={(v) => setOutput(o.terminal, v)} />
                    )
                  }
                  onExpand={() => setExpanded(expanded === o.terminal ? null : o.terminal)}
                />
                {expanded === o.terminal && (
                  <div className="wg:max-w-xl wg:pb-4 wg:pl-2">
                    <OutputForm output={o} />
                  </div>
                )}
              </div>
            ))}
          {config.devices.flatMap((d) =>
            (profileOf(d)?.actions ?? []).map((a) => (
              <SignalRow
                key={`${d.id}/${a.id}`}
                name={`${d.name} · ${a.name}`}
                source={`${d.name}`}
                offline={!live.deviceOnline[d.id]}
                control={<Toggle label={a.name} disabled={!live.deviceOnline[d.id]} on={!!live.modbus[`${d.id}/${a.id}`]} onChange={(v) => setModbusAction(d.id, a.id, v)} />}
              />
            )),
          )}
        </div>
      </section>

      <section>
        <h2 className="wg:mb-2 wg:text-lg wg:font-semibold">Inputs &amp; measurements</h2>
        <div className="wg:flex wg:flex-col wg:divide-y wg:divide-border">
          {config.inputs
            .filter((i) => showUnused || i.name)
            .map((i) => {
              const on = !!live.di[i.terminal] !== i.invert;
              return (
                <SignalRow
                  key={i.terminal}
                  name={i.name}
                  onRename={(name) => updateInput(i.terminal, { name })}
                  source={`CC100 ${i.terminal}`}
                  control={
                    <span className="wg:flex wg:w-28 wg:items-center wg:justify-end wg:gap-2 wg:text-sm">
                      {on ? 'Active' : 'Inactive'} <Led on={on} />
                    </span>
                  }
                />
              );
            })}
          {config.devices.flatMap((d) =>
            (profileOf(d)?.measurements ?? []).map((m) => (
              <SignalRow
                key={`${d.id}/${m.id}`}
                name={`${d.name} · ${m.name}`}
                source={d.name}
                offline={!live.deviceOnline[d.id]}
                control={<span className="wg:w-28 wg:text-right wg:font-semibold wg:tabular-nums">{live.deviceOnline[d.id] ? fmt(live.modbus[`${d.id}/${m.id}`], m.unit) : '—'}</span>}
              />
            )),
          )}
        </div>
      </section>
      <Button variant="ghost" className="wg:self-start" onPress={() => setShowUnused(!showUnused)}>
        {showUnused ? 'Hide unused terminals' : `Show ${unused} unused CC100 terminals`}
      </Button>

      <Modal isOpen={!!modal} onOpenChange={(v) => !v && setModal(null)}>
        <ModalBackdrop>
          <ModalContainer size="lg">
            <ModalDialog>
              <ModalHeader>
                <ModalHeading>{modal?.step === 'pick' ? 'What are you connecting?' : modal?.step === 'bus' ? 'RS-485 port' : editing?.name}</ModalHeading>
              </ModalHeader>
              <ModalBody>
                {modal?.step === 'pick' && (
                  <div className="wg:grid wg:gap-3 wg:sm:grid-cols-2">
                    {allProfiles()
                      .filter((p) => !p.name.includes('UNQUALIFIED'))
                      .map((p) => (
                        <Card key={p.id} variant="secondary" className="wg:cursor-pointer" onClick={() => setModal({ step: 'edit', id: addDevice(p.id) })}>
                          <Card.Header>
                            <Card.Title>{p.name}</Card.Title>
                            <Card.Description>
                              {p.measurements.length} values · {p.actions.length} switches
                            </Card.Description>
                          </Card.Header>
                        </Card>
                      ))}
                  </div>
                )}
                {modal?.step === 'bus' && <BusForm />}
                {editing && <DeviceForm device={editing} />}
              </ModalBody>
              <ModalFooter>
                {editing && (
                  <Button
                    variant="danger"
                    onPress={() => {
                      removeDevice(editing.id);
                      setModal(null);
                    }}
                  >
                    Remove
                  </Button>
                )}
                <Button variant="primary" onPress={() => setModal(null)}>
                  Done
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}

function SignalRow({
  name,
  onRename,
  source,
  live,
  control,
  offline,
  onExpand,
}: {
  name: string;
  onRename?: (v: string) => void;
  source: string;
  live?: string;
  control: React.ReactNode;
  offline?: boolean;
  onExpand?: () => void;
}) {
  return (
    <div className="wg:flex wg:min-h-14 wg:items-center wg:gap-3">
      <div className="wg:min-w-0 wg:flex-1">
        {onRename ? (
          <Input aria-label="Name" variant="secondary" className="wg:w-full wg:max-w-sm" value={name} placeholder="Unused — type a name" onChange={(e) => onRename(e.target.value)} />
        ) : (
          <p className="wg:truncate">{name}</p>
        )}
      </div>
      <Chip size="sm" variant="soft" color={offline ? 'danger' : 'default'}>
        {offline ? `${source} offline` : source}
      </Chip>
      {live && <span className="wg:hidden wg:w-14 wg:text-xs wg:text-muted wg:sm:inline">{live}</span>}
      <div className="wg:flex wg:w-32 wg:justify-end">{control}</div>
      <div className="wg:w-8">
        {onExpand && (
          <Button isIconOnly size="sm" variant="ghost" aria-label="Behavior" onPress={onExpand}>
            <ChevronDown className="wg:size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
