import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import {
  Button,
  Card,
  CardProps,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { PageHeader } from '../../../../../components/pageHeader';
import { SmartphoneNfcIcon, Trash2Icon } from 'lucide-react';
import {
  useBillingServiceGetSumUpConfiguration,
  useBillingServiceGetSumUpReaders,
} from '@attraccess/react-query-client';
import { EmptyState } from '../../../../../components/emptyState';
import { SumUpReadersPairing } from './pairing';
import { SumUpReaderDeleteModal } from './remove';

export function SumUpReadersCard(props: Omit<CardProps, 'children'>) {
  const { t, language } = useTranslations({ en, de });

  const { data: readers } = useBillingServiceGetSumUpReaders(undefined, {
    refetchInterval: 5000,
  });

  const { data: configuration } = useBillingServiceGetSumUpConfiguration();

  if (!configuration?.enabled) {
    return null;
  }

  return (
    <Card {...props}>
      <Card.Header>
        <PageHeader
          icon={<SmartphoneNfcIcon />}
          title={t('title')}
          subtitle={t('subtitle')}
          noMargin
          actions={[
            {
              key: 'pair-reader',
              label: t('actions.pairReader'),
              icon: <Trash2Icon className="w-4 h-4" />,
              variant: 'primary',
              renderTrigger: (triggerProps) => (
                <SumUpReadersPairing>{(onOpen) => <Button {...triggerProps} onPress={onOpen} />}</SumUpReadersPairing>
              ),
            },
          ]}
        />
      </Card.Header>

      <Card.Content>
        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('table.ariaLabel')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('table.columns.name')}</TableColumn>
                <TableColumn>{t('table.columns.device')}</TableColumn>
                <TableColumn>{t('table.columns.status')}</TableColumn>
                <TableColumn>{t('table.columns.actions')}</TableColumn>
              </TableHeader>
              {/* the mapping of the language into the readers is to trick heroui to re-render when the language changes */}
              <TableBody
                items={(readers ?? []).map((reader) => ({ ...reader, language }))}
                renderEmptyState={() => <EmptyState />}
              >
                {(reader) => (
                  <TableRow key={reader.id} id={reader.id}>
                    <TableCell>{reader.name}</TableCell>
                    <TableCell>{reader.device.model}</TableCell>
                    <TableCell>{reader.status}</TableCell>
                    <TableCell>
                      <SumUpReaderDeleteModal readerId={reader.id} readerName={reader.name}>
                        {(onOpen) => (
                          <Button variant="danger-soft" onPress={onOpen}>
                            <Trash2Icon className="w-4 h-4" />
                            {t('table.actions.deleteReader')}
                          </Button>
                        )}
                      </SumUpReaderDeleteModal>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      </Card.Content>
    </Card>
  );
}
