import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chip } from '@heroui/react';
import { ArrowRightIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useAttractapServiceGetFirmwares,
  useAttractapServiceGetReaders,
  useLicenseServiceGetLicenseInformation,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useNow } from '../../../hooks/useNow';
import de from './de.json';
import en from './en.json';

export function useAttractapListState() {
  const { t } = useTranslations({
    de,
    en,
  });

  const { data: license } = useLicenseServiceGetLicenseInformation();

  const { data: firmwares } = useAttractapServiceGetFirmwares();

  const { data: allReaders, error: readersError } = useAttractapServiceGetReaders(undefined, {
    refetchInterval: 5000,
  });

  const toast = useToastMessage();
  const navigate = useNavigate();

  const [openedReaderEditor, setOpenedReaderEditor] = useState<number | null>(null);

  useEffect(() => {
    if (readersError) {
      toast.error({
        title: t('error.fetchReaders'),
        description: (readersError as Error).message,
      });
    }
  }, [readersError, t, toast]);

  const formatDateTime = useDateTimeFormatter();

  const now = useNow();

  const { stale: staleReaders, active: activeReaders } = useMemo(() => {
    const stale = [];
    const active = [];
    for (const reader of allReaders ?? []) {
      const lastConnection = new Date(reader.lastConnection);
      const isStale = lastConnection.getTime() < now.getTime() - 24 * 60 * 60 * 1000;
      if (isStale) {
        stale.push(reader);
      } else {
        active.push(reader);
      }
    }

    active.sort((a, b) => a.name.localeCompare(b.name));
    stale.sort((a, b) => {
      const aLastConnection = new Date(a.lastConnection);
      const bLastConnection = new Date(b.lastConnection);
      return bLastConnection.getTime() - aLastConnection.getTime();
    });

    return { stale, active };
  }, [allReaders, now]);

  const firmwareUpdateChip = useCallback(
    (reader: Attractap) => {
      const latestFirmware = firmwares?.find((firmware) => {
        return firmware.name === reader.firmware.name && firmware.variant === reader.firmware.variant;
      });

      const isSame = reader.firmware.version === latestFirmware?.version;

      if (isSame || !latestFirmware) {
        return <Chip>v{reader.firmware.version}</Chip>;
      }

      return (
        <Chip color="warning">
          <span className="whitespace-nowrap">
            v{reader.firmware.version} <ArrowRightIcon size={14} className="inline" /> v{latestFirmware.version}
          </span>
        </Chip>
      );
    },
    [firmwares],
  );
  return {
    t,
    license,
    navigate,
    openedReaderEditor,
    setOpenedReaderEditor,
    formatDateTime,
    staleReaders,
    activeReaders,
    firmwareUpdateChip,
  } as const;
}
