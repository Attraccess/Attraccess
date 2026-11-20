import { Button } from '@attraccess/plugins-frontend-ui';
import type { InstalledPluginVersionDto } from '@attraccess/react-query-client';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  versions: InstalledPluginVersionDto[];
  selectedVersion: InstalledPluginVersionDto | null;
  onSelect: (candidate: InstalledPluginVersionDto) => void;
}

export function VersionCandidates({ versions, selectedVersion, onSelect }: Props) {
  const { t } = usePluginsTranslations();
  return (
    <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
      {versions.map((candidate) => (
        <Button
          key={candidate.version}
          variant={selectedVersion?.version === candidate.version ? 'primary' : 'secondary'}
          className="justify-between"
          isDisabled={!candidate.compatible || candidate.direction === 'current'}
          onPress={() => onSelect(candidate)}
          data-cy={`plugins-list-version-${candidate.version}`}
        >
          <span>{candidate.version}</span>
          <span>{t(`versionManagement.direction.${candidate.direction}`)}</span>
        </Button>
      ))}
    </div>
  );
}
