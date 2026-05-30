import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Button, Card, Chip, Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow, TableScrollContainer } from '@heroui/react';
import { ArrowRightIcon, CpuIcon, LogsIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';
import { EmptyState } from '../../../components/emptyState';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttractapEditor } from '../AttractapEditor/AttractapEditor';
import {
  Attractap,
  useAttractapServiceGetFirmwares,
  useAttractapServiceGetReaders,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { PageAction, PageHeader } from '../../../components/pageHeader';
import { AttractapHardwareSetup } from '../HardwareSetup';
import { WebSerialConsole } from '../HardwareSetup/WebSerialConsole';
import { useNow } from '../../../hooks/useNow';

import de from './de.json';
import en from './en.json';
import { AttractapDeleteModal } from './delete';

export function AttractapList() {
  const { t } = useTranslations({
    de,
    en,
  });

  const { data: firmwares } = useAttractapServiceGetFirmwares();

  const {
    data: allReaders,
    error: readersError,
  } = useAttractapServiceGetReaders(undefined, {
    refetchInterval: 5000,
  });

  const toast = useToastMessage();

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

  return (
    <>
      <AttractapHardwareSetup
        openDeviceSettings={(deviceId) => {
          setOpenedReaderEditor(Number(deviceId));
        }}
      >
        {(onOpenHardwareSetup) => (
          <WebSerialConsole>
            {(onOpenSerialConsole) => (
              <PageHeader
                title={t('page.title')}
                backTo="/attractap"
                actions={[
                  {
                    key: 'serial-console',
                    label: t('page.actions.openSerialConsole'),
                    icon: <LogsIcon className="w-4 h-4" />,
                    onPress: onOpenSerialConsole,
                    dataCy: 'attractap-list-open-console-button',
                  },
                  {
                    key: 'hardware-setup',
                    label: t('page.actions.openHardwareSetup'),
                    icon: <CpuIcon className="w-4 h-4" />,
                    onPress: onOpenHardwareSetup,
                    dataCy: 'attractap-list-open-flasher-button',
                  },
                ] satisfies PageAction[]}
              />
            )}
          </WebSerialConsole>
        )}
      </AttractapHardwareSetup>

      <Alert status="danger" className="mb-4">
        <AlertStatusIcon status="danger" />
        <AlertContent>
          <AlertTitle>{t('workInProgressTitle')}</AlertTitle>
          <AlertDescription>{t('workInProgress')}</AlertDescription>
        </AlertContent>
      </Alert>

      <AttractapEditor
        readerId={openedReaderEditor ?? undefined}
        isOpen={openedReaderEditor !== null}
        onCancel={() => setOpenedReaderEditor(null)}
        onSave={() => setOpenedReaderEditor(null)}
      />

      <div className="flex flex-col gap-4">
        {[activeReaders, staleReaders].map((readers, tableIndex) => (
          <Card key={tableIndex}>
            <Card.Header>
              <PageHeader
                noMargin
                title={t(`table.${tableIndex === 0 ? 'active' : 'stale'}.title`)}
                subtitle={t(`table.${tableIndex === 0 ? 'active' : 'stale'}.description`)}
              />
            </Card.Header>
            <Card.Content>
              <Table data-cy={`attractap-list-table-${tableIndex === 0 ? 'active' : 'stale'}`}>
                <TableScrollContainer>
                  <TableContent aria-label={`${tableIndex === 0 ? 'active' : 'stale'} attractaps`}>
                    <TableHeader>
                      <TableColumn isRowHeader>{t('table.columns.name')}</TableColumn>
                      <TableColumn>{t('table.columns.type')}</TableColumn>
                      <TableColumn>{t('table.columns.lastConnection')}</TableColumn>
                      <TableColumn>{t('table.columns.actions')}</TableColumn>
                    </TableHeader>
                    <TableBody items={readers ?? []} renderEmptyState={() => <EmptyState />}>
                      {(reader) => (
                        <TableRow
                          key={reader.id}
                          id={reader.id}
                          className={tableIndex === 1 ? 'border-l-8 border-l-warning' : ''}
                        >
                          <TableCell>{reader.name}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {reader.firmware.name} ({reader.firmware.variant})
                            <br />
                            {firmwareUpdateChip(reader)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateTime(reader.lastConnection)}</TableCell>
                          <TableCell className="flex-row flex">
                            <Button
                              variant="ghost"
                              onPress={() => setOpenedReaderEditor(reader.id)}
                              data-cy={`attractap-list-edit-reader-button-${reader.id}`}
                            >
                              <PencilIcon className="w-4 h-4" />
                              {t('table.actions.editReader')}
                            </Button>

                            <AttractapDeleteModal readerId={reader.id}>
                              {(onOpen) => (
                                <Button
                                  variant="danger-soft"
                                  onPress={onOpen}
                                  data-cy={`attractap-list-delete-reader-button-${reader.id}`}
                                >
                                  <Trash2Icon className="w-4 h-4" />
                                  {t('table.actions.deleteReader')}
                                </Button>
                              )}
                            </AttractapDeleteModal>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            </Card.Content>
          </Card>
        ))}
      </div>
    </>
  );
}
