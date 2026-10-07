import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  cn,
} from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useAttractapServiceGetAllCards,
  NFCCard,
  useLicenseServiceGetLicenseInformation,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { EmptyState } from '../../../components/emptyState';
import de from './de.json';
import en from './en.json';
import { PlusIcon, ServerIcon } from 'lucide-react';
import { PageAction, PageHeader } from '../../../components/pageHeader';
import { useAuth } from '../../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { EnrollNfcCard } from './index.state';
import { NfcCardDeleteModal } from './index.state';
import { NfcCardTableCell } from './index.nfc-card-table-cell';

export function RfidCardList() {
  const { t } = useTranslations({
    de,
    en,
  });

  const { data: license } = useLicenseServiceGetLicenseInformation();

  const { data: cards, error: cardsError } = useAttractapServiceGetAllCards(undefined, {
    refetchInterval: 5000,
  });

  const toast = useToastMessage();

  useEffect(() => {
    if (cardsError) {
      toast.error({
        title: t('errorFetchCards'),
        description: (cardsError as Error).message,
      });
    }
  }, [cardsError, toast, t]);

  const headers = useMemo(() => {
    const headers: Array<keyof NFCCard | 'actions'> = ['id', 'createdAt', 'uid', 'lastSeen', 'actions'];

    return headers;
  }, []);

  const [cardToDeleteId, setCardToDeleteId] = useState<number | null>(null);

  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  if (license && !license.modules.includes('attractap')) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={t('nfcCards')}
        actions={
          [
            {
              key: 'enroll',
              label: t('enroll'),
              icon: <PlusIcon />,
              variant: 'primary',
              dataCy: 'enroll-nfc-card-button-trigger',
              renderTrigger: (triggerProps) => (
                <EnrollNfcCard>{(onOpen) => <Button {...triggerProps} onPress={onOpen} />}</EnrollNfcCard>
              ),
            },
            {
              key: 'readers',
              label: t('readers'),
              icon: <ServerIcon />,
              isHidden: !hasPermission('resources.update'),
              onPress: () => navigate('/attractap/readers'),
            },
          ] satisfies PageAction[]
        }
      />

      <NfcCardDeleteModal
        show={cardToDeleteId !== null}
        close={() => setCardToDeleteId(null)}
        cardId={cardToDeleteId}
      />

      <Table data-cy="nfc-card-list-table">
        <TableScrollContainer>
          <TableContent aria-label={t('nfcCards')}>
            <TableHeader>
              {headers.map((header, idx) => (
                <TableColumn key={header} id={header} isRowHeader={idx === 0}>
                  {t('nfcCardsTable.headers.' + header)}
                </TableColumn>
              ))}
            </TableHeader>
            <TableBody items={cards ?? []} renderEmptyState={() => <EmptyState />}>
              {(card) => (
                <TableRow
                  key={card.id}
                  id={card.id}
                  className={cn('border-l-4', card.isActive ? 'border-l-success' : 'border-l-warning')}
                >
                  {headers.map((header) => (
                    <TableCell key={header}>
                      <NfcCardTableCell header={header} card={card} onDeleteClick={() => setCardToDeleteId(card.id)} />
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </>
  );
}
