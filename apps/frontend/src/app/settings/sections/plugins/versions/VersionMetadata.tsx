import { LabeledSwitch, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import type { InstalledPluginVersionDto } from '@attraccess/react-query-client';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  selectedVersion: InstalledPluginVersionDto;
  permissionApproved: boolean;
  onPermissionApprovedChange: (approved: boolean) => void;
  majorApproved: boolean;
  onMajorApprovedChange: (approved: boolean) => void;
}

export function VersionMetadata({
  selectedVersion,
  permissionApproved,
  onPermissionApprovedChange,
  majorApproved,
  onMajorApprovedChange,
}: Props) {
  const { t } = usePluginsTranslations();
  const formatDateTime = useDateTimeFormatter({ showTime: false });
  return (
    <>
      {selectedVersion.publishedAt ? (
        <p>
          {t('versionManagement.published', {
            date: formatDateTime(selectedVersion.publishedAt),
          })}
        </p>
      ) : null}
      {selectedVersion.permissionAdditions.length > 0 ? (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={permissionApproved}
            onChange={(event) => onPermissionApprovedChange(event.target.checked)}
          />
          {t('versionManagement.permissionApproval', {
            permissions: selectedVersion.permissionAdditions.join(', '),
          })}
        </label>
      ) : null}
      {selectedVersion.semverImpact === 'major' ? (
        <LabeledSwitch isSelected={majorApproved} onChange={onMajorApprovedChange}>
          {t('versionManagement.majorApproval')}
        </LabeledSwitch>
      ) : null}
      {selectedVersion.deprecated ? (
        <p className="text-warning">{t('versionManagement.deprecated', { notice: selectedVersion.deprecated })}</p>
      ) : null}
      <p className="break-all">{t('versionManagement.integrity', { integrity: selectedVersion.integrity ?? '-' })}</p>
      {selectedVersion.repository ? (
        <a className="text-accent" href={selectedVersion.repository} target="_blank" rel="noreferrer">
          {t('versionManagement.repository')}
        </a>
      ) : null}
      {selectedVersion.permissionRemovals.length > 0 ? (
        <p>
          {t('versionManagement.permissionRemovals', {
            permissions: selectedVersion.permissionRemovals.join(', '),
          })}
        </p>
      ) : null}
    </>
  );
}
