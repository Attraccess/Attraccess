import { useEffect, useState } from 'react';
import { Alert, Button, Chip, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { Cloud, CloudOff, CpuIcon } from 'lucide-react';
import { TableDataLoadingIndicator } from '../../../components/tableComponents';
import { EmptyState } from '../../../components/emptyState';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { AttractapEditor } from '../AttractapEditor/AttractapEditor';
import { useAttractapServiceGetReaders } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import { AttractapFlasher } from '../AttractapFlasher';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';

import de from './de.json';
import en from './en.json';

export const AttractapList = () => {
  const { t } = useTranslations('attractap-list', {
    de,
    en,
  });

  const {
    data: readers,
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

  return (
    <>
      <PageHeader
        title={t('page.title')}
        actions={
          <AttractapFlasher>
            {(onOpen) => (
              <Button
                variant="light"
                startContent={<CpuIcon className="w-4 h-4" />}
                onPress={onOpen}
                data-cy="attractap-list-open-flasher-button"
              >
                {t('page.actions.openFlasher')}
              </Button>
            )}
          </AttractapFlasher>
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

      <Table aria-label="Attractaps" data-cy="attractap-list-table">
        <TableHeader>
          <TableColumn>{t('table.columns.name')}</TableColumn>
          <TableColumn>{t('table.columns.lastConnection')}</TableColumn>
          <TableColumn>{t('table.columns.connected')}</TableColumn>
          <TableColumn>{t('table.columns.actions')}</TableColumn>
        </TableHeader>
        <TableBody
          items={readers ?? []}
          loadingState={loadingState}
          loadingContent={<TableDataLoadingIndicator />}
          emptyContent={<EmptyState />}
        >
          {(reader) => (
            <TableRow key={reader.id}>
              <TableCell>{reader.name}</TableCell>
              <TableCell>{formatDateTime(reader.lastConnection)}</TableCell>
              <TableCell>
                <Chip color={reader.connected ? 'success' : 'danger'}>
                  {reader.connected ? <Cloud /> : <CloudOff />}
                </Chip>
              </TableCell>
              <TableCell>
                <Button
                  onPress={() => setOpenedReaderEditor(reader.id)}
                  data-cy={`attractap-list-edit-reader-button-${reader.id}`}
                >
                  {t('table.actions.editReader')}
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
};
