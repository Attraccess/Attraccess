import { useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import type { InstalledPluginVersionDto } from '@attraccess/react-query-client';
import { Chip, Description, Label, Radio, RadioGroup } from '@heroui/react';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  versions: InstalledPluginVersionDto[];
  selectedVersion: InstalledPluginVersionDto | null;
  onSelect: (candidate: InstalledPluginVersionDto) => void;
}

const DIRECTION_COLOR = { newer: 'success', older: 'warning', current: 'default' } as const;

/** The published versions as a single choice. The installed and incompatible ones are listed, disabled, with why. */
export function VersionCandidates({ versions, selectedVersion, onSelect }: Props) {
  const { t } = usePluginsTranslations();
  const formatDate = useDateTimeFormatter({ showTime: false });
  if (versions.length === 0) return <p className="text-sm text-muted">{t('versionManagement.noVersions')}</p>;
  return (
    <RadioGroup
      aria-label={t('versionManagement.availableHeading')}
      value={selectedVersion?.version ?? null}
      onChange={(version) => {
        const candidate = versions.find((entry) => entry.version === version);
        if (candidate) onSelect(candidate);
      }}
    >
      {versions.map((candidate) => {
        const reason =
          candidate.direction === 'current'
            ? t('versionManagement.installedNow')
            : !candidate.compatible
              ? t('versionManagement.notCompatible', { reason: candidate.reason ?? '' })
              : null;
        return (
          <Radio
            key={candidate.version}
            value={candidate.version}
            isDisabled={!candidate.compatible || candidate.direction === 'current'}
            data-cy={`plugins-list-version-${candidate.version}`}
          >
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="break-all">{candidate.version}</Label>
                  <Chip size="sm" variant="soft" color={DIRECTION_COLOR[candidate.direction]}>
                    {t(`versionManagement.direction.${candidate.direction}`)}
                  </Chip>
                  {candidate.publishedAt ? (
                    <span className="text-xs text-muted">{formatDate(candidate.publishedAt)}</span>
                  ) : null}
                </div>
                {reason ? <Description className="break-words">{reason}</Description> : null}
              </div>
            </Radio.Content>
          </Radio>
        );
      })}
    </RadioGroup>
  );
}
