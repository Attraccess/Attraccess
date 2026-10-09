import { Chip, Label, ProgressBar } from '@heroui/react';
import type { RuntimeUpdateStatus, WagoController } from '../api/client';
import { useWagoTranslations } from '../i18n';

const activePhases = new Set(['preparing', 'staging', 'activating', 'verifying', 'accepting', 'recovering']);

export function RuntimeUpdateSummary({
  controller,
  status,
  unavailable = false,
  compact = false,
}: {
  controller: WagoController;
  status?: RuntimeUpdateStatus;
  unavailable?: boolean;
  compact?: boolean;
}) {
  const { t } = useWagoTranslations();
  const update = status?.update;
  const after = status?.runtime?.desiredVersion ?? update?.desiredRuntimeVersion;
  const afterImage = status?.runtime?.desiredImageId ?? update?.desiredImageId;
  const matchesTarget = !afterImage || !update || update.desiredImageId === afterImage;
  const before =
    matchesTarget &&
    update?.previousImageId &&
    update.previousImageId !== update.desiredImageId &&
    'previousRuntimeVersion' in update
      ? update.previousRuntimeVersion
      : (status?.runtime?.runningVersion ?? controller.runtimeVersion);
  const beforeImage = matchesTarget
    ? (update?.previousImageId ?? status?.runtime?.runningImageId)
    : status?.runtime?.runningImageId;
  const runningMismatch = Boolean(
    status?.runtime?.runningImageId && afterImage && status.runtime.runningImageId !== afterImage,
  );
  const required = status?.runtimeUpdateRequired || controller.connectivity === 'runtime_update' || runningMismatch;
  const waitingForController = controller.connectivity === 'stale' || controller.connectivity === 'runtime_check';
  const changedImage = Boolean(beforeImage && afterImage && beforeImage !== afterImage);
  const transition =
    changedImage || (required && !waitingForController) || Boolean(before && after && before !== after);
  const completed = matchesTarget && transition && update?.phase === 'current' && !required && !status?.blocker;
  const active =
    !unavailable &&
    (!status || status.management === 'managed') &&
    !status?.blocker &&
    (activePhases.has(update?.phase ?? '') ||
      (required && !waitingForController && (!update || update.phase === 'current')));
  const phase = activePhases.has(update?.phase ?? '') ? update?.phase : 'waiting';
  const label = (version: string | null | undefined, image: string | null | undefined) => {
    const text = version ? `v${version}` : t('runtimeManagement.unknownVersion');
    return changedImage && before === after && image ? `${text} (${image.replace(/^sha256:/, '').slice(0, 8)})` : text;
  };

  return (
    <div className={compact ? 'wg:max-w-80 wg:space-y-1' : 'wg:space-y-2'}>
      <Chip
        className={compact ? 'wg:max-w-full' : undefined}
        size="sm"
        variant="soft"
        color={completed ? 'success' : transition ? 'warning' : 'default'}
      >
        <span
          className={compact ? 'wg:block wg:max-w-76 wg:truncate' : undefined}
          aria-label={
            transition
              ? t('runtimeManagement.versionChange', {
                  before: label(before, beforeImage),
                  after: label(after, afterImage),
                })
              : undefined
          }
        >
          {label(before, beforeImage)}
          {transition && <> → {label(after, afterImage)}</>}
        </span>
      </Chip>
      {completed && <p className="wg:text-xs wg:text-success">{t('runtimeManagement.updated')}</p>}
      {active && compact && (
        <div className="wg:flex wg:items-center wg:gap-2">
          <span className="wg:truncate wg:text-xs">{t(`runtimeManagement.progressShort.${phase}`)}</span>
          <ProgressBar
            isIndeterminate
            size="sm"
            color="warning"
            className="wg:w-16 wg:shrink-0"
            aria-label={t(`runtimeManagement.progressShort.${phase}`)}
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        </div>
      )}
      {active && !compact && (
        <ProgressBar isIndeterminate size="sm" color="warning">
          <Label>{t(`runtimeManagement.progress.${phase}`)}</Label>
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      )}
      {compact && status?.management === 'verified' && status.managementSetup && !update && (
        <p role="status" className="wg:truncate wg:text-xs wg:text-muted">
          {t(
            `runtimeManagement.setupShort.${status.managementSetup.state === 'running' ? 'running' : status.managementSetup.reason === 'configuration' ? 'configuration' : 'waiting'}`,
          )}
        </p>
      )}
      {!active && !completed && update && update.phase !== 'current' && (
        <p role="status" className="wg:truncate wg:text-xs">
          {t(`runtimeManagement.phases.${update.phase}`)}
        </p>
      )}
    </div>
  );
}
