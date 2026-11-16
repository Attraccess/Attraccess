import { Button, LabeledSwitch } from '@attraccess/plugins-frontend-ui';
import {
  type InstalledNpmPluginDto,
  type InstalledPluginVersionDto,
  usePluginsServicePluginControllerInstalledPackageVersions,
  usePluginsServicePluginControllerReplaceInstalledPackage,
  usePluginsServicePluginControllerUpdateInstalledPackagePolicy,
} from '@attraccess/react-query-client';
import { Input, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { useEffect, useEffectEvent, useState } from 'react';
import { Select } from '../../../../../components/select/index';
import { useToastMessage } from '../../../../../components/toastProvider';
import { dependencyError } from '../dependencies/dependencyError';
import { DependencyPlanDetails } from '../dependencies/DependencyPlanDetails';
import { usePluginDependencyPlan } from '../dependencies/usePluginDependencyPlan';
import { useInstalledNpmPlugins } from '../installed/useInstalledNpmPlugins';
import type { VersionPlugin } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { VersionCandidates } from './VersionCandidates';
import { VersionMetadata } from './VersionMetadata';

interface Props {
  plugin: VersionPlugin;
  isReplacing: boolean;
  onReplacingChange: (isReplacing: boolean) => void;
  onClose: () => void;
  onCancel: () => void;
}

/** The dialog content; it mounts when the dialog opens, so every opening starts from a clean selection. */
export function VersionManagementContent({ plugin, isReplacing, onReplacingChange, onClose, onCancel }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { installedByName, mergeInstalled } = useInstalledNpmPlugins();
  const installed = installedByName.get(plugin.name);
  const { mutateAsync: replaceInstalledPlugin } =
    usePluginsServicePluginControllerReplaceInstalledPackage<InstalledNpmPluginDto>();
  const { mutateAsync: updateInstalledPluginPolicy } =
    usePluginsServicePluginControllerUpdateInstalledPackagePolicy<InstalledNpmPluginDto>();

  const [requestedSpec, setRequestedSpec] = useState(installed?.requestedSpec ?? plugin.version);
  const [updateOverride, setUpdateOverride] = useState<InstalledNpmPluginDto['updateOverride']>(
    installed?.updateOverride ?? 'inherit',
  );
  const [selectedVersion, setSelectedVersion] = useState<InstalledPluginVersionDto | null>(null);
  const [permissionApproved, setPermissionApproved] = useState(false);
  const [majorApproved, setMajorApproved] = useState(false);
  const [approvedPlanToken, setApprovedPlanToken] = useState<string | null>(null);

  const versionsQuery = usePluginsServicePluginControllerInstalledPackageVersions(
    { packageName: plugin.name },
    undefined,
    { retry: false, refetchOnWindowFocus: false },
  );
  const versions = versionsQuery.data ?? [];
  const reportVersionsError = useEffectEvent(() =>
    toast.error({ title: t('error.versions.title'), description: t('error.versions.description') }),
  );
  useEffect(() => {
    if (versionsQuery.errorUpdatedAt) reportVersionsError();
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
        packageName: plugin.name,
        version: selectedVersion.version,
        requestBody: {
          approvedPermissionAdditions: selectedVersion.permissionAdditions,
          approvedMajorVersion: majorApproved,
          ...(hasVersionDependencies ? { planToken: versionPlan?.token } : {}),
        },
      });
      toast.success({
        title: t('success.replace.title'),
        description: t('success.replace.description'),
      });
      setTimeout(() => window.location.reload(), 5000);
      onClose();
    } catch {
      toast.error({ title: t('error.replace.title'), description: t('error.replace.description') });
    } finally {
      onReplacingChange(false);
    }
  };

  const saveVersionPolicy = async () => {
    try {
      mergeInstalled([
        await updateInstalledPluginPolicy({ packageName: plugin.name, requestBody: { requestedSpec, updateOverride } }),
      ]);
      toast.success({ title: t('versionManagement.policySaved') });
    } catch {
      toast.error({ title: t('versionManagement.policyError') });
    }
  };

  return (
    <>
      <ModalHeader>
        <ModalHeading>{t('versionManagement.title', { pluginName: plugin.name })}</ModalHeading>
      </ModalHeader>
      <ModalBody>
        <p>{t('versionManagement.current', { version: plugin.version })}</p>
        <div className="flex flex-col gap-2 rounded-medium border border-divider p-3">
          <TextField value={requestedSpec} onChange={setRequestedSpec}>
            <Input aria-label={t('versionManagement.spec')} placeholder="^1.2.0 or latest" />
          </TextField>
          <Select
            value={updateOverride}
            onChange={(value) => setUpdateOverride(value as InstalledNpmPluginDto['updateOverride'])}
            items={['inherit', 'off', 'patch', 'minor', 'follow'].map((value) => ({
              key: value,
              label: t(`versionManagement.overrides.${value}`),
            }))}
            aria-label={t('versionManagement.autoUpdate')}
          />
          <Button variant="secondary" size="sm" onPress={() => void saveVersionPolicy()}>
            {t('versionManagement.savePolicy')}
          </Button>
        </div>
        {versionsQuery.isFetching ? <p>{t('versionManagement.loading')}</p> : null}
        <VersionCandidates versions={versions} selectedVersion={selectedVersion} onSelect={selectVersion} />
        {selectedVersion ? (
          <div className="flex flex-col gap-2 rounded-medium border border-divider p-3">
            <p>{t('versionManagement.selected', { version: selectedVersion.version })}</p>
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
            {selectedVersion.direction === 'older' ? (
              <p className="text-warning">{t('versionManagement.downgradeWarning')}</p>
            ) : null}
          </div>
        ) : null}
        {versions
          .filter((candidate) => !candidate.compatible)
          .map((candidate) => (
            <p key={candidate.version} className="text-danger text-sm">
              {candidate.version}: {candidate.reason}
            </p>
          ))}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onPress={onCancel} isDisabled={isReplacing}>
          {t('versionManagement.cancel')}
        </Button>
        <Button
          variant={selectedVersion?.direction === 'older' ? 'danger' : 'primary'}
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
          {selectedVersion?.direction === 'older' ? t('versionManagement.downgrade') : t('versionManagement.update')}
        </Button>
      </ModalFooter>
    </>
  );
}
