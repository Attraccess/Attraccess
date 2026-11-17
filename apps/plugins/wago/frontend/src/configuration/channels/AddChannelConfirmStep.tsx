import type { ConfigurationEditorMetadata } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import type { AddChannelDraft, TerminalOption } from './channelWorkspaceModel';

interface AddChannelConfirmStepProps {
  draft: AddChannelDraft;
  direction: 'input' | 'output';
  selectedTerminal: TerminalOption | undefined;
  metadata: ConfigurationEditorMetadata;
}

export function AddChannelConfirmStep({ draft, direction, selectedTerminal, metadata }: AddChannelConfirmStepProps) {
  const { t } = useWagoTranslations();
  const { name, purpose, pulseMs, guardId, disconnect, timeoutMs } = draft;
  return (
    <div className="wg:flex wg:flex-col wg:gap-3">
      <h3 className="wg:text-lg wg:font-semibold">{name.trim()}</h3>
      <p>
        {t(`channels.purposes.${purpose}.label`)} · CC100 {selectedTerminal?.label}
      </p>
      {purpose === 'pulse' && <p>{t('channels.pulseSummary', { duration: pulseMs })}</p>}
      {purpose === 'guard' && <p>{t('channels.guardSummary', { name: metadata.names[guardId] || guardId })}</p>}
      <p>
        {direction === 'input'
          ? t('channels.monitorSummary')
          : t('channels.disconnectSummary', {
              policy:
                disconnect === 'watchdog'
                  ? t('channels.watchdogSummary', { timeout: timeoutMs })
                  : t(`channels.${disconnect}`),
            })}
      </p>
      <p className="wg:text-sm wg:text-muted">{t('channels.localHint')}</p>
    </div>
  );
}
