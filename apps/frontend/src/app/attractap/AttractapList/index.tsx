import { isBleBridge } from '../bleBridge';
import { pairedReadersOnly } from '../cardWriting';
import { isReaderStale } from '../readerStaleness';
import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Chip,
} from '@heroui/react';
import { ActivityIcon, CpuIcon, LogsIcon, PencilIcon, Trash2Icon, ArrowRightIcon } from 'lucide-react';
import { AttractapEditor } from '../AttractapEditor/AttractapEditor';
import { ReadersToPair } from '../pairing/ReadersToPair';
import { AttractapHardwareSetup } from '../HardwareSetup/index';
import { WebSerialConsole } from '../HardwareSetup/WebSerialConsole/index';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  EmptyState,
  PageAction,
  PageHeader,
  TableActionsColumnHeader,
  TableRowActions,
  useDateTimeFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  Attractap,
  useDeleteReader,
  useGetFirmwares,
  useGetReaders,
  useGetReadersToPair,
  useGetLicenseInformation,
  UseGetReadersKeyFn,
  UseGetReadersToPairKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useNow } from '../../../hooks/useNow';
import de from './de.json';
import en from './en.json';

export function AttractapList() {
  // React escapes the output; escaping names again would show `A &amp; B` in confirmations.
  const { t } = useTranslations(
    {
      de,
      en,
    },
    { escapeValues: false },
  );

  const { data: license } = useGetLicenseInformation();

  const { data: firmwares } = useGetFirmwares();

  const { data: allReaders, error: readersError } = useGetReaders({}, undefined, {
    refetchInterval: 5000,
  });

  // Readers that are not paired yet come from their own list and are shown in the pairing card only.
  const { data: readersToPair } = useGetReadersToPair({}, undefined, { refetchInterval: 5000 });

  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { mutateAsync: deleteReader } = useDeleteReader(undefined, {
    onSuccess: () => {
      // The deleted record can be in either list.
      queryClient.invalidateQueries({ queryKey: UseGetReadersKeyFn() });
      queryClient.invalidateQueries({ queryKey: UseGetReadersToPairKeyFn() });
    },
    onError: (error) => {
      toast.error({ title: t('error.deleteReader'), description: (error as Error).message });
    },
  });

  const [openedReaderEditor, setOpenedReaderEditor] = useState<number | null>(null);

  // `?editReader=ID`: after a reader was paired from a link the settings open right away.
  const [searchParams, setSearchParams] = useSearchParams();
  const editReaderParam = searchParams.get('editReader');
  useEffect(() => {
    if (editReaderParam === null || !allReaders) return;
    const reader = allReaders.find((r) => r.id === Number(editReaderParam));
    if (reader?.pairingState === 'paired') setOpenedReaderEditor(reader.id);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('editReader');
        return next;
      },
      { replace: true },
    );
  }, [editReaderParam, allReaders, setSearchParams]);

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
    // Readers that are not paired are only listed in the Not paired card until they are paired.
    for (const reader of pairedReadersOnly(allReaders)) {
      if (isReaderStale(reader, now)) {
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
  const noPairedReaders = allReaders !== undefined && activeReaders.length + staleReaders.length === 0;

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

  if (license && !license.modules.includes('attractap')) {
    return null;
  }

  return (
    <>
      <AttractapHardwareSetup
        openDeviceSettings={(deviceId, justPaired) => {
          // A reader can only be edited once it is paired. One approved a moment ago is not in this list yet.
          const reader = allReaders?.find((r) => r.id === Number(deviceId));
          if (justPaired || reader?.pairingState === 'paired') setOpenedReaderEditor(Number(deviceId));
          else toast.info({ title: t('pairFirst') });
        }}
      >
        {(onOpenHardwareSetup) => (
          <WebSerialConsole>
            {(onOpenSerialConsole) => (
              <PageHeader
                title={t('page.title')}
                actions={
                  [
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
                  ] satisfies PageAction[]
                }
              />
            )}
          </WebSerialConsole>
        )}
      </AttractapHardwareSetup>

      <AttractapEditor
        readerId={openedReaderEditor ?? undefined}
        isOpen={openedReaderEditor !== null}
        onCancel={() => setOpenedReaderEditor(null)}
        onSave={() => setOpenedReaderEditor(null)}
      />

      <div className="flex flex-col gap-4">
        <ReadersToPair readers={readersToPair ?? []} onPaired={setOpenedReaderEditor} />
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
                      <TableColumn>
                        <TableActionsColumnHeader />
                      </TableColumn>
                    </TableHeader>
                    <TableBody
                      items={readers ?? []}
                      renderEmptyState={() => (
                        <>
                          <EmptyState message={t('table.noData')} />
                          {/* With no paired reader at all, say where readers come from (e.g. right after the upgrade). */}
                          {tableIndex === 0 && noPairedReaders && (
                            <p
                              className="pb-6 text-center text-sm text-default-500"
                              data-cy="attractap-list-empty-hint"
                            >
                              {t('table.emptyHint')}
                            </p>
                          )}
                        </>
                      )}
                    >
                      {(reader) => (
                        <TableRow
                          key={reader.id}
                          id={reader.id}
                          className={tableIndex === 1 ? 'border-l-8 border-l-warning' : ''}
                        >
                          <TableCell>
                            {reader.name}
                            {isBleBridge(reader) && (
                              <>
                                <br />
                                <Chip variant="soft" color="accent" data-cy={`attractap-list-ble-bridge-${reader.id}`}>
                                  {t('bleBridge')}
                                </Chip>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {reader.firmware.name ? (
                              <>
                                {reader.firmware.name} ({reader.firmware.variant})
                                <br />
                                {firmwareUpdateChip(reader)}
                              </>
                            ) : (
                              // A reader paired a moment ago has not reported its firmware yet.
                              '–'
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{formatDateTime(reader.lastConnection)}</TableCell>
                          <TableCell>
                            <TableRowActions
                              itemName={reader.name}
                              actions={[
                                {
                                  key: 'edit',
                                  label: t('table.actions.editReader'),
                                  icon: PencilIcon,
                                  onPress: () => setOpenedReaderEditor(reader.id),
                                  'data-cy': `attractap-list-edit-reader-button-${reader.id}`,
                                },
                                {
                                  key: 'diagnostics',
                                  label: t('table.actions.diagnostics'),
                                  icon: ActivityIcon,
                                  href: `/attractap/readers/${reader.id}/diagnostics`,
                                  'data-cy': `attractap-list-diagnostics-reader-button-${reader.id}`,
                                },
                                {
                                  key: 'delete',
                                  label: t('table.actions.deleteReader'),
                                  icon: Trash2Icon,
                                  tone: 'danger',
                                  onPress: () => deleteReader({ path: { readerId: reader.id } }),
                                  confirm: {
                                    title: t('deleteConfirm.title', { name: reader.name }),
                                    message: t('deleteConfirm.message'),
                                    confirmDataCy: `attractap-list-delete-reader-confirm-${reader.id}`,
                                  },
                                  'data-cy': `attractap-list-delete-reader-button-${reader.id}`,
                                },
                              ]}
                            />
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
