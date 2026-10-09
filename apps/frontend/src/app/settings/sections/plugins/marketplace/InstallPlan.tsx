import { Alert, AlertContent, AlertDescription, AlertTitle, ModalBody } from '@heroui/react';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import { dependencyError, DependencyPlanDetails } from '../dependencies/DependencyPlan';
import { usePluginsSectionState } from '../state/usePluginSettings';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'pluginToInstall'
  | 'installPlanRoot'
  | 't'
  | 'hasDependencies'
  | 'dependencyPlan'
  | 'planError'
  | 'isResolvingDependencies'
  | 'installApproved'
  | 'setApprovedInstallPlanToken'
  | 'installApprovalToken'
  | 'installFailure'
>;
export function InstallPlan({
  pluginToInstall,
  installPlanRoot,
  t,
  hasDependencies,
  dependencyPlan,
  planError,
  isResolvingDependencies,
  installApproved,
  setApprovedInstallPlanToken,
  installApprovalToken,
  installFailure,
}: Props) {
  return (
    <ModalBody>
      {pluginToInstall ? (
        <div className="flex flex-col gap-3">
          <PluginClassificationBadge
            classification={installPlanRoot?.classification ?? pluginToInstall.classification}
          />
          <p>{t('marketplace.installDescription')}</p>
          <p>{t('marketplace.source', { registry: installPlanRoot?.registryUrl ?? pluginToInstall.registry.url })}</p>
          <p>{t('marketplace.version', { version: installPlanRoot?.version ?? pluginToInstall.version ?? '-' })}</p>
          <p>
            {t('marketplace.permissions', {
              permissions:
                (installPlanRoot?.permissions ?? pluginToInstall.permissions).join(', ') || t('noPermissions'),
            })}
          </p>
          {hasDependencies ? (
            <DependencyPlanDetails
              dependencies={installPlanRoot?.dependencies ?? pluginToInstall.dependencies ?? []}
              plan={dependencyPlan}
              error={dependencyError(planError)}
              loading={isResolvingDependencies}
              t={t}
            />
          ) : null}
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={installApproved}
              onChange={(event) =>
                setApprovedInstallPlanToken(event.target.checked ? (installApprovalToken ?? null) : null)
              }
            />
            {t('marketplace.installApproval')}
          </label>
          <p className="text-warning text-sm">{t('marketplace.restartWarning')}</p>
          {installFailure ? (
            <Alert status="danger">
              <AlertContent>
                <AlertTitle>{t('marketplace.installError')}</AlertTitle>
                <AlertDescription>{installFailure}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </ModalBody>
  );
}
