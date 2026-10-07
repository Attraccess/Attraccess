import { Button, Card } from '@heroui/react';
import { Cable, Settings2 } from 'lucide-react';
import { DIGITAL_TERMINALS } from '../../../backend/configuration-digital';
import { outputBehavior } from '../../../channel-behavior';
import { useWagoTranslations } from '../i18n';
import { busConnection, terminalChannel, terminalName, type PanelConfiguration, type Terminal } from './model';
import type { LiveControls } from './Cards.live-controls';
import { OutputControl } from './Cards.helpers';
import { channelSample } from './Cards.helpers';

export function OnboardCard({
  configuration,
  live,
  disabled,
  editTerminal,
  editBus,
}: {
  configuration: PanelConfiguration;
  live: LiveControls;
  disabled: boolean;
  editTerminal: (terminal: Terminal) => void;
  editBus: () => void;
}) {
  const { t, language } = useWagoTranslations();
  const bus = busConnection(configuration.snapshot);
  return (
    <Card className="wg:min-w-0">
      <Card.Header className="wg:flex wg:flex-row wg:flex-wrap wg:items-start wg:justify-between wg:gap-3">
        <div>
          <Card.Title>{t('panel.onboard')}</Card.Title>
          <Card.Description>{t('panel.terminalHint')}</Card.Description>
        </div>
        <Button variant="ghost" size="sm" isDisabled={disabled} onPress={editBus}>
          <Cable className="wg:size-4" />
          {t('panel.busSummary', {
            baud: bus.transport === 'rtu' ? bus.baudRate : 9600,
            parity: bus.transport === 'rtu' ? { none: 'N', even: 'E', odd: 'O' }[bus.parity] : 'E',
            bits: bus.transport === 'rtu' ? bus.stopBits : 1,
          })}
        </Button>
      </Card.Header>
      <Card.Content className="wg:grid wg:grid-cols-1 wg:gap-6 wg:lg:grid-cols-2">
        <section aria-label={t('panel.outputs')}>
          <h2 className="wg:mb-3 wg:text-sm wg:font-medium wg:text-muted">{t('panel.outputs')}</h2>
          <div className="wg:grid wg:grid-cols-2 wg:gap-3">
            {DIGITAL_TERMINALS.filter((terminal) => terminal.direction === 'output').map((terminal) => {
              const channel = terminalChannel(configuration.snapshot, terminal);
              const name = terminalName(configuration, terminal);
              const applied = live.applied && terminalChannel(live.applied.snapshot, terminal);
              const appliedName = live.applied ? terminalName(live.applied, terminal) : '';
              const manual = applied && live.diagnostics?.manualOutputChannelIds?.includes(applied.id);
              return (
                <div
                  key={terminal.label}
                  className={`wg:relative wg:flex wg:min-h-36 wg:min-w-0 wg:flex-col wg:gap-3 wg:rounded-xl wg:border wg:border-border wg:bg-surface-secondary wg:p-4 ${name ? '' : 'wg:opacity-55'}`}
                >
                  <Button
                    variant="ghost"
                    aria-label={t('panel.configure', { name: `${terminal.label} ${name}` })}
                    className="wg:absolute wg:inset-0 wg:h-full wg:w-full wg:items-start wg:justify-end wg:rounded-xl wg:p-3"
                    isDisabled={disabled}
                    onPress={() => editTerminal(terminal)}
                  >
                    <Settings2 className="wg:absolute wg:top-3 wg:right-3 wg:size-4" />
                  </Button>
                  {/* Position content above the full-card button's hover background. */}
                  <div className="wg:pointer-events-none wg:relative wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-2 wg:pr-7">
                    <span className="wg:text-xs wg:font-semibold">{terminal.label}</span>
                    {appliedName && (
                      <div className="wg:pointer-events-auto wg:relative">
                        <OutputControl live={live} channel={applied} label={`${terminal.label} ${appliedName}`} />
                      </div>
                    )}
                  </div>
                  <p className="wg:pointer-events-none wg:relative wg:break-words wg:font-medium">
                    {name || t('panel.unused')}
                  </p>
                  <p className="wg:pointer-events-none wg:relative wg:mt-auto wg:text-xs wg:text-muted">
                    {outputBehavior(applied || channel || { capabilities: [] }) === 'pulsed'
                      ? t('panel.pulseSummary', {
                          seconds: new Intl.NumberFormat(language).format(
                            ((applied || channel)?.pulse?.durationMs ?? 0) / 1000,
                          ),
                        })
                      : t('panel.switched')}{' '}
                    · {t(manual ? 'panel.manual' : 'panel.flow')}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        <section aria-label={t('panel.inputs')}>
          <h2 className="wg:mb-3 wg:text-sm wg:font-medium wg:text-muted">{t('panel.inputs')}</h2>
          <div className="wg:grid wg:grid-cols-1 wg:gap-2 wg:sm:grid-cols-2">
            {DIGITAL_TERMINALS.filter((terminal) => terminal.direction === 'input').map((terminal) => {
              const name = terminalName(configuration, terminal);
              const channel = live.applied && terminalChannel(live.applied.snapshot, terminal);
              const sample = channelSample(live, channel?.id, 'input');
              return (
                <Button
                  key={terminal.label}
                  variant="ghost"
                  isDisabled={disabled}
                  aria-label={t('panel.configure', { name: `${terminal.label} ${name}` })}
                  onPress={() => editTerminal(terminal)}
                  className={`wg:h-auto wg:min-h-12 wg:w-full wg:min-w-0 wg:justify-start wg:gap-2 wg:rounded-lg wg:bg-surface-secondary wg:px-3 wg:py-3 wg:whitespace-normal ${name ? '' : 'wg:opacity-55'}`}
                >
                  <span
                    aria-label={t(sample ? (sample.value ? 'panel.on' : 'panel.off') : 'panel.unknown')}
                    className={`wg:size-2.5 wg:shrink-0 wg:rounded-full ${sample ? (sample.value ? 'wg:bg-success' : 'wg:bg-muted') : 'wg:border wg:border-muted'}`}
                  />
                  <span className="wg:shrink-0 wg:text-xs wg:text-muted">{terminal.label}</span>
                  <span className="wg:min-w-0 wg:flex-1 wg:break-words wg:text-left wg:text-sm">
                    {name || t('panel.unused')}
                  </span>
                  <Settings2 className="wg:size-4 wg:shrink-0 wg:text-muted" />
                </Button>
              );
            })}
          </div>
        </section>
      </Card.Content>
    </Card>
  );
}
