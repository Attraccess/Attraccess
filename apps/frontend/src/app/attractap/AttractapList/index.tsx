import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Card,
  CardHeader,
  CardBody,
} from '@heroui/react';
import { CpuIcon, LogsIcon, MoreVertical, PencilIcon, Trash2Icon } from 'lucide-react';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttractapEditor } from '../AttractapEditor/AttractapEditor';
import { useAttractapServiceGetReaders } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import { AttractapHardwareSetup } from '../HardwareSetup';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import { WebSerialConsole } from '../HardwareSetup/WebSerialConsole';
import { useNow } from '../../../hooks/useNow';

import de from './de.json';
import en from './en.json';
import { AttractapDeleteModal } from './delete';

export const AttractapList = () => {
  const { t } = useTranslations('attractap-list', {
    de,
    en,
  });

  const {
    data: allReaders,
    error: readersError,
    status: fetchStatus,
  } = useAttractapServiceGetReaders(undefined, {
    refetchInterval: 5000,
  });

  const loadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

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
    const readersSortedByLastConnection = (allReaders ?? []).sort((a, b) => {
      const aLastConnection = new Date(a.lastConnection);
      const bLastConnection = new Date(b.lastConnection);
      return bLastConnection.getTime() - aLastConnection.getTime();
    });

    const stale = [];
    const active = [];
    for (const reader of readersSortedByLastConnection) {
      const lastConnection = new Date(reader.lastConnection);
      const isStale = lastConnection.getTime() < now.getTime() - 24 * 60 * 60 * 1000;
      if (isStale) {
        stale.push(reader);
      } else {
        active.push(reader);
      }
    }
    return { stale, active };
  }, [allReaders, now]);

  return (
    <>
      <PageHeader
        title={t('page.title')}
        actions={
          <AttractapHardwareSetup
            openDeviceSettings={(deviceId) => {
              setOpenedReaderEditor(Number(deviceId));
            }}
          >
            {(onOpenHardwareSetup) => (
              <WebSerialConsole>
                {(onOpenSerialConsole) => (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button variant="light" startContent={<MoreVertical className="w-4 h-4" />}>
                        {t('page.actions.menu')}
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Attractap actions">
                      <DropdownItem
                        key="serial-console"
                        startContent={<LogsIcon className="w-4 h-4" />}
                        onPress={onOpenSerialConsole}
                        data-cy="attractap-list-open-console-button"
                      >
                        {t('page.actions.openSerialConsole')}
                      </DropdownItem>

                      <DropdownItem
                        key="hardware-setup"
                        startContent={<CpuIcon className="w-4 h-4" />}
                        onPress={onOpenHardwareSetup}
                        data-cy="attractap-list-open-flasher-button"
                      >
                        {t('page.actions.openHardwareSetup')}
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                )}
              </WebSerialConsole>
            )}
          </AttractapHardwareSetup>
        }
      />

      <Alert color="danger" className="mb-4">
        {t('workInProgress')}
      </Alert>

      <AttractapEditor
        readerId={openedReaderEditor ?? undefined}
        isOpen={openedReaderEditor !== null}
        onCancel={() => setOpenedReaderEditor(null)}
        onSave={() => setOpenedReaderEditor(null)}
      />

      <div className="flex flex-col gap-4">
        {[activeReaders, staleReaders].map((readers, tableIndex) => (
          <Card>
            <CardHeader>
              <PageHeader
                noMargin
                title={t(`table.${tableIndex === 0 ? 'active' : 'stale'}.title`)}
                subtitle={t(`table.${tableIndex === 0 ? 'active' : 'stale'}.description`)}
              />
            </CardHeader>
            <CardBody>
              <Table
                aria-label={`${tableIndex === 0 ? 'active' : 'stale'} attractaps`}
                data-cy={`attractap-list-table-${tableIndex === 0 ? 'active' : 'stale'}`}
                removeWrapper
              >
                <TableHeader>
                  <TableColumn>{t('table.columns.name')}</TableColumn>
                  <TableColumn>{t('table.columns.lastConnection')}</TableColumn>
                  <TableColumn>{t('table.columns.actions')}</TableColumn>
                </TableHeader>
                <TableBody
                  items={readers ?? []}
                  loadingState={loadingState}
                  loadingContent={<TableDataLoadingIndicator />}
                  emptyContent={<EmptyState />}
                >
                  {(reader) => (
                    <TableRow key={reader.id} className={tableIndex === 1 ? 'border-l-8 border-l-warning' : ''}>
                      <TableCell className="w-full">{reader.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(reader.lastConnection)}</TableCell>
                      <TableCell className="flex-row flex">
                        <Button
                          size="sm"
                          startContent={<PencilIcon className="w-4 h-4" />}
                          variant="light"
                          onPress={() => setOpenedReaderEditor(reader.id)}
                          data-cy={`attractap-list-edit-reader-button-${reader.id}`}
                        >
                          {t('table.actions.editReader')}
                        </Button>

                        <AttractapDeleteModal readerId={reader.id}>
                          {(onOpen) => (
                            <Button
                              startContent={<Trash2Icon className="w-4 h-4" />}
                              size="sm"
                              color="danger"
                              variant="light"
                              onPress={onOpen}
                              data-cy={`attractap-list-delete-reader-button-${reader.id}`}
                            >
                              {t('table.actions.deleteReader')}
                            </Button>
                          )}
                        </AttractapDeleteModal>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
};
