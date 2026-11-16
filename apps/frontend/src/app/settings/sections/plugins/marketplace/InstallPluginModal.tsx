import { Button, StandardModal } from '@attraccess/plugins-frontend-ui';
import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { usePluginsServicePluginControllerInstallPackage } from '@attraccess/react-query-client';
import { ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { usePluginDependencyPlan } from '../dependencies/usePluginDependencyPlan';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { describeInstallFailure } from './describeInstallFailure';
import { InstallPlan } from './InstallPlan';

interface Props {
  /** The package to install; the dialog is open while this is set. */
  plugin: MarketplacePluginDto | null;
  onClose: () => void;
}

export function InstallPluginModal({ plugin, onClose }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { mutateAsync: installPluginPackage } = usePluginsServicePluginControllerInstallPackage();
  const [approvedPlanToken, setApprovedPlanToken] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installFailure, setInstallFailure] = useState<string | null>(null);

  const hasDependencies = Boolean(plugin?.dependencies?.length);
  const {
    data: dependencyPlan,
    error: planError,
    isFetching: isResolvingDependencies,
  } = usePluginDependencyPlan(
    hasDependencies
      ? { packageName: plugin.name, spec: plugin.version ?? undefined, registryId: plugin.registry.id }
      : undefined,
    // The package details behind this dialog already resolved the plan.
    { reuseResolvedPlan: true },
  );
  const approvalToken = hasDependencies
    ? dependencyPlan?.token
    : plugin && `${plugin.registry.id}:${plugin.name}@${plugin.version}`;
  const planRoot = hasDependencies
    ? dependencyPlan?.plugins.find((entry) => entry.name === plugin?.name && entry.version === plugin?.version)
    : undefined;
  const approved = Boolean(approvalToken && approvedPlanToken === approvalToken);

  const dismiss = () => {
    onClose();
    setApprovedPlanToken(null);
    setInstallFailure(null);
  };

  const installMarketplacePlugin = async () => {
    if (!plugin?.version) return;
    setIsInstalling(true);
    setInstallFailure(null);
    try {
      await installPluginPackage({
        packageName: plugin.name,
        version: plugin.version,
        requestBody: {
          registryId: plugin.registry.id,
          ...(hasDependencies ? { planToken: dependencyPlan?.token } : {}),
        },
      });
      toast.success({ title: t('marketplace.installSuccess') });
      setTimeout(() => window.location.reload(), 5000);
      onClose();
      setApprovedPlanToken(null);
    } catch (error) {
      setInstallFailure(describeInstallFailure(error, t));
      toast.error({ title: t('marketplace.installError') });
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <StandardModal
      isOpen={plugin !== null}
      onOpenChange={(open) => {
        if (!open && !isInstalling) dismiss();
      }}
      size="md"
    >
      <ModalHeader>
        <ModalHeading>
          {t('marketplace.installTitle', { pluginName: plugin?.displayName ?? plugin?.name ?? '' })}
        </ModalHeading>
      </ModalHeader>
      <InstallPlan
        plugin={plugin}
        planRoot={planRoot}
        hasDependencies={hasDependencies}
        dependencyPlan={dependencyPlan}
        planError={planError}
        isResolvingDependencies={isResolvingDependencies}
        approved={approved}
        onApprovedChange={(checked) => setApprovedPlanToken(checked ? (approvalToken ?? null) : null)}
        failure={installFailure}
      />
      <ModalFooter>
        <Button variant="ghost" onPress={dismiss} isDisabled={isInstalling}>
          {t('marketplace.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={() => void installMarketplacePlugin()}
          isPending={isInstalling}
          isDisabled={
            !approved || (hasDependencies && (!dependencyPlan || Boolean(planError) || isResolvingDependencies))
          }
        >
          {t('marketplace.confirmInstall')}
        </Button>
      </ModalFooter>
    </StandardModal>
  );
}
