import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { ActivityIcon, CpuIcon, LogsIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { EmptyState } from '../../../components/emptyState';
import { AttractapEditor } from '../AttractapEditor/AttractapEditor';
import { PageAction, PageHeader } from '../../../components/pageHeader';
import { AttractapHardwareSetup } from '../HardwareSetup';
import { WebSerialConsole } from '../HardwareSetup/WebSerialConsole';
import { AttractapDeleteModal } from './delete';
import { useAttractapListState } from './useAttractapListState';

export function AttractapList() {
  const {
    t,
    license,
    navigate,
    openedReaderEditor,
    setOpenedReaderEditor,
    formatDateTime,
    staleReaders,
    activeReaders,
    firmwareUpdateChip,
  } = useAttractapListState();

  if (license && !license.modules.includes('attractap')) {
    return null;
  }

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
                          <TableCell>
                            <div className="flex flex-row gap-2">
                              <Button
                                variant="ghost"
                                onPress={() => setOpenedReaderEditor(reader.id)}
                                data-cy={`attractap-list-edit-reader-button-${reader.id}`}
                              >
                                <PencilIcon className="w-4 h-4" />
                                {t('table.actions.editReader')}
                              </Button>

                              <Button
                                variant="ghost"
                                onPress={() => navigate(`/attractap/readers/${reader.id}/diagnostics`)}
                                data-cy={`attractap-list-diagnostics-reader-button-${reader.id}`}
                              >
                                <ActivityIcon className="w-4 h-4" />
                                {t('table.actions.diagnostics')}
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
                            </div>
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
