import { useMemo } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Select } from '../../components/select';
import type { DownloadFormat } from './download';
import de from './de.json';
import en from './en.json';

interface DownloadControlsProps {
  format: DownloadFormat;
  onFormatChange: (format: DownloadFormat) => void;
  /** Whether a finished render matches the current settings; only the mesh formats need one. */
  meshReady: boolean;
  onDownload: () => void;
}

/** Format picker and download button beneath a model's preview. */
export function DownloadControls({ format, onFormatChange, meshReady, onDownload }: DownloadControlsProps) {
  const { t } = useTranslations({ de, en });

  const formatOptions = useMemo(
    () => [
      { key: '3mf', label: t('format3mf') },
      { key: 'stl', label: t('formatStl') },
      { key: 'scad', label: t('formatScad') },
    ],
    [t],
  );

  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <Select
        label={t('format')}
        value={format}
        onChange={(key) => onFormatChange(key as DownloadFormat)}
        items={formatOptions}
        className="w-full sm:w-64"
        data-cy="printables-format-select"
      />
      {/* The .scad source is independent of any render, so it is always available. */}
      <Button isDisabled={format !== 'scad' && !meshReady} onPress={onDownload} data-cy="printables-download">
        {t('download')}
      </Button>
    </div>
  );
}
