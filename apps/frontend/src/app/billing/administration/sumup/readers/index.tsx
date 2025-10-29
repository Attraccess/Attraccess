import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardProps,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { SmartphoneNfcIcon, Trash2Icon } from 'lucide-react';
import {
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpReaders,
} from '@attraccess/react-query-client';
import { TableDataLoadingIndicator } from '../../../../../components/tableComponents';
import { EmptyState } from '../../../../../components/emptyState';
import { SumUpReadersPairing } from './pairing';
import { SumUpReaderDeleteModal } from './remove';

export function SumUpReadersCard(props: Omit<CardProps, 'children'>) {
  const { t, language } = useTranslations({ en, de });

  const { data: readers, isLoading: isLoadingReaders } = useBillingServiceGetSumUpReaders(undefined, {
    refetchInterval: 5000,
  });

  const { data: configuration } = useBillingServiceGetSumUpConfiguration();

  if (!configuration?.enabled) {
    return null;
  }

  return (
    <Card {...props}>
      <CardHeader>
        <PageHeader
          icon={<SmartphoneNfcIcon />}
          title={t('title')}
          subtitle={t('subtitle')}
          noMargin
          actions={
            <SumUpReadersPairing>
              {(onOpen) => (
                <Button size="sm" color="primary" onPress={onOpen}>
                  {t('actions.pairReader')}
                </Button>
              )}
            </SumUpReadersPairing>
          }
        />
      </CardHeader>

      <CardBody>
        <Table removeWrapper>
          <TableHeader>
            <TableColumn>{t('table.columns.name')}</TableColumn>
            <TableColumn>{t('table.columns.device')}</TableColumn>
            <TableColumn>{t('table.columns.status')}</TableColumn>
            <TableColumn align="end">{t('table.columns.actions')}</TableColumn>
          </TableHeader>
          {/* the mapping of the language into the readers is to trick heroui to re-render when the language changes */}
          <TableBody
            items={(readers ?? []).map((reader) => ({ ...reader, language }))}
            loadingState={isLoadingReaders ? 'loading' : 'idle'}
            loadingContent={<TableDataLoadingIndicator />}
            emptyContent={<EmptyState />}
          >
            {(reader) => (
              <TableRow key={reader.id}>
                <TableCell>{reader.name}</TableCell>
                <TableCell>{reader.device.model}</TableCell>
                <TableCell>{reader.status}</TableCell>
                <TableCell>
                  <SumUpReaderDeleteModal readerId={reader.id} readerName={reader.name}>
                    {(onOpen) => (
                      <Button
                        size="sm"
                        startContent={<Trash2Icon className="w-4 h-4" />}
                        variant="light"
                        onPress={onOpen}
                        color="danger"
                      >
                        {t('table.actions.deleteReader')}
                      </Button>
                    )}
                  </SumUpReaderDeleteModal>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
