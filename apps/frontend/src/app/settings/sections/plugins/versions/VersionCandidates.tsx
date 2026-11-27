import { Button, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import type { InstalledPluginVersionDto } from '@attraccess/react-query-client';
import { Chip, Description, Label, Radio, RadioGroup } from '@heroui/react';
import { useState } from 'react';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  versions: InstalledPluginVersionDto[];
  /** While the first load runs there is nothing to list, and no "no versions" either. */
  isLoading: boolean;
  selectedVersion: InstalledPluginVersionDto | null;
  onSelect: (candidate: InstalledPluginVersionDto) => void;
}

const DIRECTION_COLOR = { newer: 'success', older: 'warning', current: 'default' } as const;

/** An older version that cannot be installed: rarely of interest, and a registry can list dozens of them. */
const isOlderIncompatible = (candidate: InstalledPluginVersionDto) =>
  !candidate.compatible && candidate.direction === 'older';

/**
 * The published versions as a single choice. The installed and incompatible ones are listed, disabled, with why.
 * Older incompatible versions stay folded away until asked for, so they do not bury the choices and the settings.
 */
export function VersionCandidates({ versions, isLoading, selectedVersion, onSelect }: Props) {
  const { t } = usePluginsTranslations();
  const formatDate = useDateTimeFormatter({ showTime: false });
  const [showOlderIncompatible, setShowOlderIncompatible] = useState(false);
  if (versions.length === 0 && isLoading) return null;
  if (versions.length === 0) return <p className="text-sm text-muted">{t('versionManagement.noVersions')}</p>;
  const olderIncompatibleCount = versions.filter(isOlderIncompatible).length;
  const shownVersions = showOlderIncompatible ? versions : versions.filter((entry) => !isOlderIncompatible(entry));
  return (
    <>
      <RadioGroup
        aria-label={t('versionManagement.availableHeading')}
        value={selectedVersion?.version ?? null}
        onChange={(version) => {
          const candidate = versions.find((entry) => entry.version === version);
          if (candidate) onSelect(candidate);
        }}
      >
        {shownVersions.map((candidate) => {
          const reason =
            candidate.direction === 'current'
              ? t('versionManagement.installedNow')
              : !candidate.compatible
                ? candidate.reason
                  ? t('versionManagement.notCompatible', { reason: candidate.reason })
                  : t('versionManagement.notCompatibleNoReason')
                : null;
          return (
            <Radio
              key={candidate.version}
              value={candidate.version}
              isDisabled={!candidate.compatible || candidate.direction === 'current'}
              data-cy={`plugins-list-version-${candidate.version}`}
            >
              {/* The whole row selects the version, not only its text. */}
              <Radio.Content className="w-full">
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
                      <span className="text-xs text-muted">
                        {t('versionManagement.published', { date: formatDate(candidate.publishedAt) })}
                      </span>
                    ) : null}
                  </div>
                  {reason ? <Description className="break-words">{reason}</Description> : null}
                </div>
              </Radio.Content>
            </Radio>
          );
        })}
      </RadioGroup>
      {olderIncompatibleCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onPress={() => setShowOlderIncompatible((shown) => !shown)}
          data-cy="plugins-list-version-toggle-incompatible"
        >
          {showOlderIncompatible
            ? t('versionManagement.hideOlderIncompatible')
            : t('versionManagement.showOlderIncompatible', { count: olderIncompatibleCount })}
        </Button>
      ) : null}
    </>
  );
}
