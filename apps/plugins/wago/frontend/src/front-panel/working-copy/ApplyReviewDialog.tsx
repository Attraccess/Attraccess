import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { DIGITAL_TERMINALS } from '../../../../backend/configuration/digital';
import { useWagoTranslations } from '../../i18n';
import type { FrontPanelWorkingCopy } from './useFrontPanel';

interface ApplyReviewDialogProps {
  panel: Pick<
    FrontPanelWorkingCopy,
    'review' | 'applied' | 'configuration' | 'live' | 'diagnostics' | 'busy' | 'cancelReview' | 'confirmApply'
  >;
}

/** Confirmation before the reviewed working copy is published: current output states and affected flows. */
export function ApplyReviewDialog({ panel }: ApplyReviewDialogProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  return (
    <StatusDialog
      isOpen={Boolean(panel.review)}
      onClose={panel.cancelReview}
      status="warning"
      title={t('panel.applyTitle')}
      closeLabel={t('panel.cancel')}
      action={{
        label: t('panel.apply'),
        onPress: panel.confirmApply,
        isPending: panel.busy,
        isDisabled: panel.busy,
      }}
    >
      <p>{t('panel.applyHint')}</p>
      <ul className="wg:mt-3 wg:flex wg:flex-col wg:gap-2">
        {panel.applied?.snapshot.logicalChannels
          .filter((channel) => channel.capabilities.includes('output'))
          .map((channel) => {
            const point = panel.applied?.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
            const terminal =
              point?.hardwareProfile === '751-9301'
                ? DIGITAL_TERMINALS.find((item) => item.direction === 'output' && item.channel === point.channel)
                : undefined;
            const sample = panel.live.enabled
              ? panel.diagnostics.data?.channels
                  .find((item) => item.id === channel.id)
                  ?.samples.find((item) => item.kind === 'output' && item.current && typeof item.value === 'boolean')
              : undefined;
            return (
              <li key={channel.id}>
                {terminal && `${terminal.label} · `}
                {panel.applied?.metadata.names[channel.id] ?? channel.id}:{' '}
                <strong>{sample ? (sample.value ? t('panel.high') : t('panel.low')) : t('panel.unknown')}</strong>
              </li>
            );
          })}
      </ul>
      {!panel.applied?.snapshot.logicalChannels.some((channel) => channel.capabilities.includes('output')) && (
        <p>{t('panel.noAppliedOutputs')}</p>
      )}
      {Boolean(panel.review?.impacts.length) && (
        <>
          <p className="wg:mt-3">{t('panel.flowImpactHint', { count: panel.review?.impacts.length ?? 0 })}</p>
          <ul className="wg:mt-3 wg:flex wg:flex-col wg:gap-2">
            {panel.review?.impacts.map((impact) => (
              <li key={impact.channelId}>
                {panel.configuration?.metadata.names[impact.channelId] ?? impact.channelId} ·{' '}
                {t('panel.flowReferences', { count: impact.references.length })}
                {impact.code === 'channel_disabled' && ` · ${tBackendMessage(impact.message)}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </StatusDialog>
  );
}
