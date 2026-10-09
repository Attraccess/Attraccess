import { ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { Button } from '../../../../../components/button/index';
import { StandardModal } from '../../../../../components/standardModal';
import { InstallPlan } from './InstallPlan';
import { usePluginsSectionState } from '../state/usePluginSettings';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'pluginToInstall'
  | 'isInstalling'
  | 'setPluginToInstall'
  | 'setApprovedInstallPlanToken'
  | 'setInstallFailure'
  | 't'
  | 'installPlanRoot'
  | 'hasDependencies'
  | 'dependencyPlan'
  | 'planError'
  | 'isResolvingDependencies'
  | 'installApproved'
  | 'installApprovalToken'
  | 'installFailure'
  | 'installMarketplacePlugin'
>;
export function InstallPluginModal({
  pluginToInstall,
  isInstalling,
  setPluginToInstall,
  setApprovedInstallPlanToken,
  setInstallFailure,
  t,
  installPlanRoot,
  hasDependencies,
  dependencyPlan,
  planError,
  isResolvingDependencies,
  installApproved,
  installApprovalToken,
  installFailure,
  installMarketplacePlugin,
}: Props) {
  return (
    <StandardModal
      isOpen={pluginToInstall !== null}
      onOpenChange={(open) => {
        if (!open && !isInstalling) {
          setPluginToInstall(null);
          setApprovedInstallPlanToken(null);
          setInstallFailure(null);
        }
      }}
      size="md"
    >
      <ModalHeader>
        <ModalHeading>
          {t('marketplace.installTitle', {
            pluginName: pluginToInstall?.displayName ?? pluginToInstall?.name ?? '',
          })}
        </ModalHeading>
      </ModalHeader>
      <InstallPlan
        {...{
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
        }}
      />
      <ModalFooter>
        <Button
          variant="ghost"
          onPress={() => {
            setPluginToInstall(null);
            setApprovedInstallPlanToken(null);
            setInstallFailure(null);
          }}
          isDisabled={isInstalling}
        >
          {t('marketplace.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={() => void installMarketplacePlugin()}
          isPending={isInstalling}
          isDisabled={
            !installApproved || (hasDependencies && (!dependencyPlan || Boolean(planError) || isResolvingDependencies))
          }
        >
          {t('marketplace.confirmInstall')}
        </Button>
      </ModalFooter>
    </StandardModal>
  );
}
