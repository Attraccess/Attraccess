import { PluginVersionMetadata } from './PluginVersionMetadata';
import { PluginVersionCandidates } from './PluginVersionCandidates';
import { Input, ModalBody, ModalFooter, ModalHeader, ModalHeading, TextField } from '@heroui/react';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { Select } from '../../../../components/select';
import { dependencyError } from './index.dependency-error.helpers';
import { InstalledNpmPlugin } from './index.contracts';
import { DependencyPlanDetails } from './index.dependency-error.helpers';
import { usePluginsSectionState } from './usePluginsSectionState';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'versionPlugin'
  | 'isReplacing'
  | 'setVersionPlugin'
  | 't'
  | 'requestedSpec'
  | 'setRequestedSpec'
  | 'updateOverride'
  | 'setUpdateOverride'
  | 'saveVersionPolicy'
  | 'isLoadingVersions'
  | 'versions'
  | 'selectedVersion'
  | 'setSelectedVersion'
  | 'setApprovedVersionPlanToken'
  | 'setPermissionApproved'
  | 'setMajorApproved'
  | 'hasVersionDependencies'
  | 'versionPlan'
  | 'versionPlanError'
  | 'isResolvingVersionDependencies'
  | 'dependencyChangesApproved'
  | 'permissionApproved'
  | 'majorApproved'
  | 'replaceVersion'
>;
export function PluginsSectionStandardModal({
  versionPlugin,
  isReplacing,
  setVersionPlugin,
  t,
  requestedSpec,
  setRequestedSpec,
  updateOverride,
  setUpdateOverride,
  saveVersionPolicy,
  isLoadingVersions,
  versions,
  selectedVersion,
  setSelectedVersion,
  setApprovedVersionPlanToken,
  setPermissionApproved,
  setMajorApproved,
  hasVersionDependencies,
  versionPlan,
  versionPlanError,
  isResolvingVersionDependencies,
  dependencyChangesApproved,
  permissionApproved,
  majorApproved,
  replaceVersion,
}: Props) {
  return (
    <StandardModal
      isOpen={versionPlugin !== null}
      onOpenChange={(open) => !open && !isReplacing && setVersionPlugin(null)}
      data-cy="plugins-list-version-management-modal"
      size="lg"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('versionManagement.title', { pluginName: versionPlugin?.name ?? '' })}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p>{t('versionManagement.current', { version: versionPlugin?.version ?? '' })}</p>
            <div className="flex flex-col gap-2 rounded-medium border border-divider p-3">
              <TextField value={requestedSpec} onChange={setRequestedSpec}>
                <Input aria-label={t('versionManagement.spec')} placeholder="^1.2.0 or latest" />
              </TextField>
              <Select
                value={updateOverride}
                onChange={(value) => setUpdateOverride(value as InstalledNpmPlugin['updateOverride'])}
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
            {isLoadingVersions ? <p>{t('versionManagement.loading')}</p> : null}
            <PluginVersionCandidates
              {...{
                versions,
                selectedVersion,
                setSelectedVersion,
                setApprovedVersionPlanToken,
                setPermissionApproved,
                setMajorApproved,
                t,
              }}
            />
            {selectedVersion ? (
              <div className="flex flex-col gap-2 rounded-medium border border-divider p-3">
                <p>{t('versionManagement.selected', { version: selectedVersion.version })}</p>
                {hasVersionDependencies ? (
                  <DependencyPlanDetails
                    dependencies={selectedVersion.dependencies ?? []}
                    plan={versionPlan}
                    error={dependencyError(versionPlanError)}
                    loading={isResolvingVersionDependencies}
                    t={t}
                  />
                ) : null}
                {versionPlan?.plugins.some((plugin) => plugin.action === 'install') ? (
                  <LabeledSwitch
                    isSelected={dependencyChangesApproved}
                    onChange={(approved) => setApprovedVersionPlanToken(approved ? (versionPlan?.token ?? null) : null)}
                  >
                    {t('dependencies.approveChanges')}
                  </LabeledSwitch>
                ) : null}
                <PluginVersionMetadata
                  {...{
                    selectedVersion,
                    t,
                    permissionApproved,
                    setPermissionApproved,
                    majorApproved,
                    setMajorApproved,
                  }}
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
            <Button variant="ghost" onPress={close} isDisabled={isReplacing}>
              {t('versionManagement.cancel')}
            </Button>
            <Button
              variant={selectedVersion?.direction === 'older' ? 'danger' : 'primary'}
              onPress={() => void replaceVersion()}
              isPending={isReplacing}
              isDisabled={
                !selectedVersion ||
                (hasVersionDependencies &&
                  (!versionPlan || Boolean(versionPlanError) || isResolvingVersionDependencies)) ||
                (versionPlan?.plugins.some((plugin) => plugin.action === 'install') && !dependencyChangesApproved) ||
                (selectedVersion.permissionAdditions.length > 0 && !permissionApproved) ||
                (selectedVersion.semverImpact === 'major' && !majorApproved)
              }
              data-cy="plugins-list-replace-version-button"
            >
              {selectedVersion?.direction === 'older'
                ? t('versionManagement.downgrade')
                : t('versionManagement.update')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
