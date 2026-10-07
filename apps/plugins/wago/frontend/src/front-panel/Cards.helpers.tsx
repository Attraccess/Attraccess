import type { LiveControls } from './Cards.live-controls';
import { Button } from '@heroui/react';
import { Switch } from '@heroui/react';
import { Zap } from 'lucide-react';
import { outputBehavior } from '../../../channel-behavior';
import { useWagoTranslations } from '../i18n';
import type { Channel } from './model';

export function channelSample(live: LiveControls, id: string | undefined, kind: 'input' | 'output' | 'measurement') {
  return live.diagnostics?.channels
    .find((channel) => channel.id === id)
    ?.samples.find((sample) => sample.kind === kind && sample.current);
}

export function OutputControl({ live, channel, label }: { live: LiveControls; channel?: Channel; label: string }) {
  const { t } = useWagoTranslations();
  const sample = channelSample(live, channel?.id, 'output');
  const disabled = !channel || !live.enabled || live.busy;
  return outputBehavior(channel ?? { capabilities: [] }) === 'pulsed' ? (
    <Button
      size="sm"
      variant="secondary"
      isDisabled={disabled}
      aria-label={t('panel.pulseOutput', { name: label })}
      onPress={() => channel && live.command(channel)}
    >
      <Zap className="wg:size-4" />
      {t('panel.pulse')}
    </Button>
  ) : (
    <Switch
      aria-label={t('panel.switchOutput', { name: label })}
      isSelected={sample?.value === true}
      isDisabled={disabled || !sample}
      onChange={(value) => channel && live.command(channel, value)}
    >
      <Switch.Content aria-label={t('panel.switchOutput', { name: label })}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
