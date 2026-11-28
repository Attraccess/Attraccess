import { Button, LabeledSwitch } from '@attraccess/plugins-frontend-ui';
import {
  type InstalledPluginVersionDto,
  usePluginControllerInstalledPackageVersions,
  usePluginControllerReplaceInstalledPackage,
} from '@attraccess/react-query-client';
import { ModalBody, ModalFooter, ModalHeader, ModalHeading, Separator } from '@heroui/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { dependencyError } from '../dependencies/dependencyError';
import { installFailureReason } from '../marketplace/describeInstallFailure';
import { DependencyPlanDetails } from '../dependencies/DependencyPlanDetails';
import { usePluginDependencyPlan } from '../dependencies/usePluginDependencyPlan';
import { useInstalledNpmPlugins } from '../installed/useInstalledNpmPlugins';
import type { VersionPlugin } from '../types';
import { useRefreshAfterPluginChange } from '../useRefreshAfterPluginChange';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { VersionCandidates } from './VersionCandidates';
import { VersionMetadata } from './VersionMetadata';
import { VersionPolicySettings } from './VersionPolicySettings';
import { VersionSection } from './VersionSection';

interface Props {
  plugin: VersionPlugin;
  isReplacing: boolean;
  onReplacingChange: (isReplacing: boolean) => void;
  onClose: () => void;
  onCancel: () => void;
}

/**
 * The dialog content, in sections: the current version, the versions to choose from, the selected version's changes
 * and approvals, and apart from the update the package's update settings. It mounts when the dialog opens, so every
 * opening starts from a clean selection.
 */
export function VersionManagementContent({ plugin, isReplacing, onReplacingChange, onClose, onCancel }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const refreshAfterPluginChange = useRefreshAfterPluginChange();
  const { installedByName } = useInstalledNpmPlugins();
  const installed = installedByName.get(plugin.name);
  // The installed package, which an update waiting for the restart already changed; the loaded plugin lags behind.
  const currentVersion = installed?.version ?? plugin.version;
  const { mutateAsync: replaceInstalledPlugin } = usePluginControllerReplaceInstalledPackage();

  const [selectedVersion, setSelectedVersion] = useState<InstalledPluginVersionDto | null>(null);
  const [permissionApproved, setPermissionApproved] = useState(false);
  const [majorApproved, setMajorApproved] = useState(false);
  const [approvedPlanToken, setApprovedPlanToken] = useState<string | null>(null);

  const versionsQuery = usePluginControllerInstalledPackageVersions({ path: { packageName: plugin.name } }, undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const versions = versionsQuery.data ?? [];
  const reportVersionsError = useEffectEvent(() =>
    toast.error({ title: t('error.versions.title'), description: t('error.versions.description') }),
  );
  // An error cached from an earlier opening is not reported again; only a failure of this opening's load is.
  const cachedErrorUpdatedAt = useRef(versionsQuery.errorUpdatedAt);
  useEffect(() => {
    if (versionsQuery.errorUpdatedAt && versionsQuery.errorUpdatedAt !== cachedErrorUpdatedAt.current) {
      cachedErrorUpdatedAt.current = versionsQuery.errorUpdatedAt;
      reportVersionsError();
    }
  }, [versionsQuery.errorUpdatedAt]);

  const hasVersionDependencies = Boolean(selectedVersion?.dependencies?.length);
  const {
    data: versionPlan,
    error: versionPlanError,
    isFetching: isResolvingVersionDependencies,
  } = usePluginDependencyPlan(
    hasVersionDependencies
      ? { packageName: plugin.name, spec: selectedVersion.version, registryId: installed?.registryId }
      : undefined,
  );
  const dependencyChangesApproved = Boolean(versionPlan && approvedPlanToken === versionPlan.token);
  const installsDependencies = Boolean(versionPlan?.plugins.some((entry) => entry.action === 'install'));
  const isDowngrade = selectedVersion?.direction === 'older';

  const selectVersion = (candidate: InstalledPluginVersionDto) => {
    setSelectedVersion(candidate);
    setApprovedPlanToken(null);
    setPermissionApproved(false);
    setMajorApproved(false);
  };

  const replaceVersion = async () => {
    if (!selectedVersion) return;
    onReplacingChange(true);
    try {
      await replaceInstalledPlugin({
        path: { packageName: plugin.name, version: selectedVersion.version },
        body: {
          approvedPermissionAdditions: selectedVersion.permissionAdditions,
          approvedMajorVersion: majorApproved,
          ...(hasVersionDependencies ? { planToken: versionPlan?.token } : {}),
        },
      });
      toast.success({
        title: t('success.replace.title'),
        description: t('success.replace.description'),
      });
      void refreshAfterPluginChange();
      onClose();
    } catch (error) {
      // The server's reason (e.g. a package it refuses) says more than a plain "try again".
      toast.error({
        title: t('error.replace.title'),
        description: installFailureReason(error) ?? t('error.replace.description'),
      });
    } finally {
      onReplacingChange(false);
    }
  };

  return (
    <>
      <ModalHeader>
        <ModalHeading className="break-words">{t('versionManagement.title', { pluginName: plugin.name })}</ModalHeading>
      </ModalHeader>
      <ModalBody className="flex flex-col gap-5">
        <VersionSection title={t('versionManagement.currentHeading')}>
          <div className="flex flex-col gap-1">
            <p className="break-all text-lg font-medium">{currentVersion}</p>
            {installed?.requestedSpec ? (
              <p className="break-all text-sm text-muted">
                {t('versionManagement.requestedSpec', { spec: installed.requestedSpec })}
              </p>
            ) : null}
          </div>
        </VersionSection>
        <VersionSection title={t('versionManagement.availableHeading')}>
          {versionsQuery.isFetching ? <p role="status">{t('versionManagement.loading')}</p> : null}
          <VersionCandidates
            versions={versions}
            isLoading={versionsQuery.isLoading}
            selectedVersion={selectedVersion}
            onSelect={selectVersion}
          />
        </VersionSection>
        {selectedVersion ? (
          <VersionSection title={t('versionManagement.detailsHeading', { version: selectedVersion.version })}>
            {hasVersionDependencies ? (
              <DependencyPlanDetails
                dependencies={selectedVersion.dependencies ?? []}
                plan={versionPlan}
                error={dependencyError(versionPlanError)}
                loading={isResolvingVersionDependencies}
              />
            ) : null}
            {installsDependencies ? (
              <LabeledSwitch
                isSelected={dependencyChangesApproved}
                onChange={(approved) => setApprovedPlanToken(approved ? (versionPlan?.token ?? null) : null)}
              >
                {t('dependencies.approveChanges')}
              </LabeledSwitch>
            ) : null}
            <VersionMetadata
              selectedVersion={selectedVersion}
              permissionApproved={permissionApproved}
              onPermissionApprovedChange={setPermissionApproved}
              majorApproved={majorApproved}
              onMajorApprovedChange={setMajorApproved}
            />
          </VersionSection>
        ) : null}
        <Separator />
        <VersionSection title={t('versionManagement.settingsHeading')}>
          <VersionPolicySettings packageName={plugin.name} fallbackSpec={currentVersion} />
        </VersionSection>
      </ModalBody>
      <ModalFooter className="flex-wrap">
        <Button variant="ghost" onPress={onCancel} isDisabled={isReplacing}>
          {t('versionManagement.cancel')}
        </Button>
        <Button
          variant={isDowngrade ? 'danger' : 'primary'}
          onPress={() => void replaceVersion()}
          isPending={isReplacing}
          isDisabled={
            !selectedVersion ||
            (hasVersionDependencies && (!versionPlan || Boolean(versionPlanError) || isResolvingVersionDependencies)) ||
            (installsDependencies && !dependencyChangesApproved) ||
            (selectedVersion.permissionAdditions.length > 0 && !permissionApproved) ||
            (selectedVersion.semverImpact === 'major' && !majorApproved)
          }
          data-cy="plugins-list-replace-version-button"
        >
          {selectedVersion
            ? t(isDowngrade ? 'versionManagement.downgradeTo' : 'versionManagement.updateTo', {
                version: selectedVersion.version,
              })
            : t('versionManagement.update')}
        </Button>
      </ModalFooter>
    </>
  );
}
