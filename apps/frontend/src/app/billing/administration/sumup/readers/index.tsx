import {
  EmptyState,
  PageHeader,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
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
import { SmartphoneNfcIcon, Trash2Icon } from 'lucide-react';
import {
  useGetSumUpConfiguration,
  useGetSumUpReaders,
  useGetSumUpReadersKey,
  useRemoveSumUpReader,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToastMessage } from '../../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { SumUpReadersPairing } from './pairing';

export function SumUpReadersCard(props: Omit<CardProps, 'children'>) {
  // React escapes the output; escaping names again would show `A &amp; B` in confirmations.
  const { t, tExists, language } = useTranslations(
    {
      en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
      de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
    },
    { escapeValues: false },
  );
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: readers } = useGetSumUpReaders({}, undefined, {
    refetchInterval: 5000,
  });

  const { data: configuration } = useGetSumUpConfiguration();

  const { mutateAsync: removeReader } = useRemoveSumUpReader(undefined, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [useGetSumUpReadersKey] }),
    onError: (error: Error) => toast.apiError({ error, t, tExists, baseTranslationKey: 'api' }),
  });

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
                <TableColumn>
                  <TableActionsColumnHeader />
                </TableColumn>
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
                      <TableRowActions
                        itemName={reader.name}
                        actions={[
                          {
                            key: 'delete',
                            label: t('table.actions.deleteReader'),
                            icon: Trash2Icon,
                            tone: 'danger',
                            onPress: () => removeReader({ path: { readerId: reader.id } }),
                            confirm: {
                              title: t('deleteConfirm.title', { name: reader.name }),
                              message: t('deleteConfirm.message'),
                            },
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
  );
}
