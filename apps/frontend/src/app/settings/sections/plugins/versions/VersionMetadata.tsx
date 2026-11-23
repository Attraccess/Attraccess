import { LabeledSwitch } from '@attraccess/plugins-frontend-ui';
import type { InstalledPluginVersionDto } from '@attraccess/react-query-client';
import { Alert, AlertContent, AlertDescription, Checkbox, Label } from '@heroui/react';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  selectedVersion: InstalledPluginVersionDto;
  permissionApproved: boolean;
  onPermissionApprovedChange: (approved: boolean) => void;
  majorApproved: boolean;
  onMajorApprovedChange: (approved: boolean) => void;
}

/** The approvals and notices of the selected version, then its release details in a muted block. */
export function VersionMetadata({
  selectedVersion,
  permissionApproved,
  onPermissionApprovedChange,
  majorApproved,
  onMajorApprovedChange,
}: Props) {
  const { t } = usePluginsTranslations();
  const notices = [
    selectedVersion.direction === 'older' ? t('versionManagement.downgradeWarning') : null,
    selectedVersion.deprecated ? t('versionManagement.deprecated', { notice: selectedVersion.deprecated }) : null,
  ].filter((notice): notice is string => notice !== null);
  return (
    <>
      {notices.map((notice) => (
        <Alert key={notice} status="warning">
          <AlertContent>
            <AlertDescription className="break-words">{notice}</AlertDescription>
          </AlertContent>
        </Alert>
      ))}
      {selectedVersion.permissionAdditions.length > 0 ? (
        <Checkbox isSelected={permissionApproved} onChange={onPermissionApprovedChange}>
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Label className="break-words">
              {t('versionManagement.permissionApproval', {
                permissions: selectedVersion.permissionAdditions.join(', '),
              })}
            </Label>
          </Checkbox.Content>
        </Checkbox>
      ) : null}
      {selectedVersion.semverImpact === 'major' ? (
        <LabeledSwitch isSelected={majorApproved} onChange={onMajorApprovedChange}>
          {t('versionManagement.majorApproval')}
        </LabeledSwitch>
      ) : null}
      {selectedVersion.permissionRemovals.length > 0 ? (
        <p className="break-words text-sm">
          {t('versionManagement.permissionRemovals', {
            permissions: selectedVersion.permissionRemovals.join(', '),
          })}
        </p>
      ) : null}
      <div className="flex flex-col gap-1 text-xs text-muted" role="group" aria-label={t('versionManagement.details')}>
        <p className="break-all">{t('versionManagement.integrity', { integrity: selectedVersion.integrity ?? '-' })}</p>
        {selectedVersion.repository ? (
          <p className="break-all">
            <a className="text-accent" href={selectedVersion.repository} target="_blank" rel="noreferrer">
              {t('versionManagement.repository')}
            </a>
          </p>
        ) : null}
      </div>
    </>
  );
}
