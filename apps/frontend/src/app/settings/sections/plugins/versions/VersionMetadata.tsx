import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import type { usePluginsSectionState } from '../state/usePluginSettings';

type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  'selectedVersion' | 't' | 'permissionApproved' | 'setPermissionApproved' | 'majorApproved' | 'setMajorApproved'
>;

export function VersionMetadata({
  selectedVersion,
  t,
  permissionApproved,
  setPermissionApproved,
  majorApproved,
  setMajorApproved,
}: Props) {
  if (!selectedVersion) return null;
  return (
    <>
      {selectedVersion.publishedAt ? (
        <p>
          {t('versionManagement.published', {
            date: new Date(selectedVersion.publishedAt).toLocaleDateString(),
          })}
        </p>
      ) : null}
      {selectedVersion.permissionAdditions.length > 0 ? (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={permissionApproved}
            onChange={(event) => setPermissionApproved(event.target.checked)}
          />
          {t('versionManagement.permissionApproval', {
            permissions: selectedVersion.permissionAdditions.join(', '),
          })}
        </label>
      ) : null}
      {selectedVersion.semverImpact === 'major' ? (
        <LabeledSwitch isSelected={majorApproved} onChange={setMajorApproved}>
          {t('versionManagement.majorApproval')}
        </LabeledSwitch>
      ) : null}
      {selectedVersion.deprecated ? (
        <p className="text-warning">{t('versionManagement.deprecated', { notice: selectedVersion.deprecated })}</p>
      ) : null}
      <p>{t('versionManagement.integrity', { integrity: selectedVersion.integrity ?? '-' })}</p>
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
