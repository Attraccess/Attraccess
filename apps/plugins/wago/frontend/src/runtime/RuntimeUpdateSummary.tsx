import { Chip, Label, ProgressBar } from '@heroui/react';
import type { RuntimeUpdateStatus, WagoController } from '../api/client';
import { useWagoTranslations } from '../i18n';

const activePhases = new Set(['preparing', 'staging', 'activating', 'verifying', 'accepting', 'recovering']);

/** The versions and image ids shown before and after the arrow. */
function runtimeVersions(controller: WagoController, status: RuntimeUpdateStatus | undefined) {
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
  return { before, beforeImage, after, afterImage, matchesTarget };
}

function runtimeTransition(
  controller: WagoController,
  status: RuntimeUpdateStatus | undefined,
  { before, beforeImage, after, afterImage, matchesTarget }: ReturnType<typeof runtimeVersions>,
) {
  const runningMismatch = Boolean(
    status?.runtime?.runningImageId && afterImage && status.runtime.runningImageId !== afterImage,
  );
  const required = status?.runtimeUpdateRequired || controller.connectivity === 'runtime_update' || runningMismatch;
  const waitingForController = controller.connectivity === 'stale' || controller.connectivity === 'runtime_check';
  const changedImage = Boolean(beforeImage && afterImage && beforeImage !== afterImage);
  const transition =
    changedImage || (required && !waitingForController) || Boolean(before && after && before !== after);
  const completed = matchesTarget && transition && status?.update?.phase === 'current' && !required && !status?.blocker;
  return { required, waitingForController, changedImage, transition, completed };
}

function runtimeUpdateActive(
  status: RuntimeUpdateStatus | undefined,
  unavailable: boolean,
  { required, waitingForController }: ReturnType<typeof runtimeTransition>,
) {
  const update = status?.update;
  return (
    !unavailable &&
    (!status || status.management === 'managed') &&
    !status?.blocker &&
    (activePhases.has(update?.phase ?? '') ||
      (required && !waitingForController && (!update || update.phase === 'current')))
  );
}

function setupShortKey(setup: NonNullable<RuntimeUpdateStatus['managementSetup']>) {
  return setup.state === 'running' ? 'running' : setup.reason === 'configuration' ? 'configuration' : 'waiting';
}

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
  const versions = runtimeVersions(controller, status);
  const { before, beforeImage, after, afterImage } = versions;
  const state = runtimeTransition(controller, status, versions);
  const { changedImage, transition, completed } = state;
  const active = runtimeUpdateActive(status, unavailable, state);
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
          {t(`runtimeManagement.setupShort.${setupShortKey(status.managementSetup)}`)}
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
