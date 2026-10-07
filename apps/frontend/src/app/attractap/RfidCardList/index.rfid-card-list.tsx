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
  useUsersServiceGetOneUserById,
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
import { EnrollNfcCard } from './index.enroll-nfc-card';
import { NfcCardDeleteModal } from './index.nfc-card-delete-modal';
import { NfcCardTableCell } from './index.nfc-card-table-cell';

export function RfidCardList({ userId }: { userId?: number }) {
  const { t } = useTranslations({
    de,
    en,
  });

  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { hasPermission } = useAuth();
  const canReadUser = hasPermission('users.read');
  const { data: owner } = useUsersServiceGetOneUserById({ id: userId }, undefined, {
    enabled: userId !== undefined && canReadUser,
  });

  const { data: cards, error: cardsError } = useAttractapServiceGetAllCards({ userId }, undefined, {
    refetchInterval: 5000,
    enabled:
      (!license || license.modules.includes('attractap')) &&
      (userId === undefined || hasPermission('users.rfid-cards.manage')),
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

  const navigate = useNavigate();

  if (license && !license.modules.includes('attractap')) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={userId === undefined ? t('nfcCards') : t('userCards', { username: owner?.username ?? `#${userId}` })}
        backTo={userId === undefined ? undefined : canReadUser ? `/users/${userId}` : '/attractap/nfc-cards'}
        actions={
          [
            {
              key: 'enroll',
              label: t('enroll'),
              icon: <PlusIcon />,
              variant: 'primary',
              dataCy: 'enroll-nfc-card-button-trigger',
              renderTrigger: (triggerProps) => (
                <EnrollNfcCard userId={userId}>
                  {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
                </EnrollNfcCard>
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
