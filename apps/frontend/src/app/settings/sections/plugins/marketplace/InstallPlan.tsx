import type {
  MarketplacePluginDto,
  PluginDependencyPlanDto,
  ResolvedPluginDependencyDto,
} from '@attraccess/react-query-client';
import { Alert, AlertContent, AlertDescription, AlertTitle, ModalBody } from '@heroui/react';
import { dependencyError } from '../dependencies/dependencyError';
import { DependencyPlanDetails } from '../dependencies/DependencyPlanDetails';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  plugin: MarketplacePluginDto | null;
  /** The plugin's own entry in the resolved install plan, which can differ from the catalogue listing. */
  planRoot: ResolvedPluginDependencyDto | undefined;
  hasDependencies: boolean;
  dependencyPlan: PluginDependencyPlanDto | undefined;
  planError: unknown;
  isResolvingDependencies: boolean;
  approved: boolean;
  onApprovedChange: (approved: boolean) => void;
  failure: string | null;
}

export function InstallPlan({
  plugin,
  planRoot,
  hasDependencies,
  dependencyPlan,
  planError,
  isResolvingDependencies,
  approved,
  onApprovedChange,
  failure,
}: Props) {
  const { t } = usePluginsTranslations();
  return (
    <ModalBody>
      {plugin ? (
        <div className="flex flex-col gap-3">
          <PluginClassificationBadge classification={planRoot?.classification ?? plugin.classification} />
          <p>{t('marketplace.installDescription')}</p>
          <p>{t('marketplace.source', { registry: planRoot?.registryUrl ?? plugin.registry.url })}</p>
          <p>{t('marketplace.version', { version: planRoot?.version ?? plugin.version ?? '-' })}</p>
          <p>
            {t('marketplace.permissions', {
              permissions: (planRoot?.permissions ?? plugin.permissions).join(', ') || t('noPermissions'),
            })}
          </p>
          {hasDependencies ? (
            <DependencyPlanDetails
              dependencies={planRoot?.dependencies ?? plugin.dependencies ?? []}
              plan={dependencyPlan}
              error={dependencyError(planError)}
              loading={isResolvingDependencies}
            />
          ) : null}
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={approved} onChange={(event) => onApprovedChange(event.target.checked)} />
            {t('marketplace.installApproval')}
          </label>
          <p className="text-warning text-sm">{t('marketplace.restartWarning')}</p>
          {failure ? (
            <Alert status="danger">
              <AlertContent>
                <AlertTitle>{t('marketplace.installError')}</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </ModalBody>
  );
}
