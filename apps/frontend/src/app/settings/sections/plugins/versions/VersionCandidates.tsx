import { Button } from '../../../../../components/button/index';
import type { usePluginsSectionState } from '../state/usePluginSettings';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'versions'
  | 'selectedVersion'
  | 'setSelectedVersion'
  | 'setApprovedVersionPlanToken'
  | 'setPermissionApproved'
  | 'setMajorApproved'
  | 't'
>;
export function VersionCandidates({
  versions,
  selectedVersion,
  setSelectedVersion,
  setApprovedVersionPlanToken,
  setPermissionApproved,
  setMajorApproved,
  t,
}: Props) {
  return (
    <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
      {versions.map((candidate) => (
        <Button
          key={candidate.version}
          variant={selectedVersion?.version === candidate.version ? 'primary' : 'secondary'}
          className="justify-between"
          isDisabled={!candidate.compatible || candidate.direction === 'current'}
          onPress={() => {
            setSelectedVersion(candidate);
            setApprovedVersionPlanToken(null);
            setPermissionApproved(false);
            setMajorApproved(false);
          }}
          data-cy={`plugins-list-version-${candidate.version}`}
        >
          <span>{candidate.version}</span>
          <span>{t(`versionManagement.direction.${candidate.direction}`)}</span>
        </Button>
      ))}
    </div>
  );
}
