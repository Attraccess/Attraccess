import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  ModalBody,
  ModalFooter,
  ModalHeader,
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
import { StandardDrawer } from '../../../components/standardDrawer';
import { StandardModal } from '../../../components/standardModal';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AttraccessUser, DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useAttractapServiceGetAllCards,
  useAttractapServiceResetNfcCard,
  NFCCard,
  useAttractapServiceEnrollNfcCard,
  useUsersServiceGetOneUserById,
} from '@attraccess/react-query-client';
import { AttractapSelect } from '../AttractapSelect';
import { useToastMessage } from '../../../components/toastProvider';
import { EmptyState } from '../../../components/emptyState';

import de from './de.json';
import en from './en.json';
import { NfcCardDeactivateModal } from './deactivate';
import { NfcCardActivateModal } from './activate';
import { CheckIcon, PlusIcon, ServerIcon, Trash2Icon, XIcon } from 'lucide-react';
import { PageAction, PageHeader } from '../../../components/pageHeader';
import { useAuth } from '../../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { TableRowActions } from '../../../components/tableRowActions';

interface DeleteModalProps {
  show: boolean;
  close: () => void;
  cardId: number | null;
}

const NfcCardDeleteModal = (props: DeleteModalProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const [readerId, setReaderId] = useState<number | null>(null);

  const { mutate: resetNfcCard } = useAttractapServiceResetNfcCard();

  const deleteCard = useCallback(() => {
    if (!props.cardId || !readerId) {
      return;
    }

    resetNfcCard({ requestBody: { readerId, cardId: props.cardId } });
  }, [props.cardId, resetNfcCard, readerId]);

  return (
    <StandardModal
      isOpen={props.show}
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      data-cy="nfc-card-delete-modal"
      size="md"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <h1>{t('nfcCardsTable.deleteModal.title')}</h1>
          </ModalHeader>
          <ModalBody>
            <p>{t('nfcCardsTable.deleteModal.description', { id: props.cardId })}</p>
            <AttractapSelect
              label={t('nfcCardsTable.deleteModal.readerLabel')}
              placeholder={t('nfcCardsTable.deleteModal.readerPlaceholder')}
              selection={readerId}
              onSelectionChange={(readerId) => setReaderId(readerId ?? null)}
              data-cy="nfc-card-delete-modal-reader-select"
            />
          </ModalBody>
          <ModalFooter>
            <Button onPress={close} data-cy="nfc-card-delete-modal-cancel-button">
              {t('nfcCardsTable.deleteModal.cancel')}
            </Button>
            <Button isDisabled={!readerId} onPress={deleteCard} data-cy="nfc-card-delete-modal-delete-button">
              {t('nfcCardsTable.deleteModal.delete')} ID: {!readerId ? 'null' : readerId}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
};

interface NfcCardTableCellProps {
  header: string;
  card: NFCCard;
  onDeleteClick: () => void;
}

const NfcCardTableCell = (props: NfcCardTableCellProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const { data: user } = useUsersServiceGetOneUserById({ id: props.card.user?.id }, undefined, {
    enabled: props.header === 'userId',
  });

  if (props.header === 'userId') {
    return <AttraccessUser user={user} />;
  }

  if (props.header === 'actions') {
    return (
      props.card.isActive ? (
        <NfcCardDeactivateModal cardId={props.card.id}>
          {(onOpen) => (
            <TableRowActions
              ariaLabel={t('nfcCardsTable.headers.actions')}
              triggerDataCy={`nfc-card-table-cell-actions-button-${props.card.id}`}
              actions={[
                {
                  key: 'deactivate',
                  label: t('nfcCardsTable.actions.deactivate'),
                  icon: <XIcon className="w-4 h-4" />,
                  onPress: onOpen,
                  dataCy: `nfc-card-table-cell-deactivate-button-${props.card.id}`,
                },
                {
                  key: 'delete',
                  label: t('nfcCardsTable.actions.delete'),
                  icon: <Trash2Icon className="w-4 h-4" />,
                  variant: 'destructive',
                  onPress: props.onDeleteClick,
                  dataCy: `nfc-card-table-cell-delete-button-${props.card.id}`,
                },
              ]}
            />
          )}
        </NfcCardDeactivateModal>
      ) : (
        <NfcCardActivateModal cardId={props.card.id}>
          {(onOpen) => (
            <TableRowActions
              ariaLabel={t('nfcCardsTable.headers.actions')}
              triggerDataCy={`nfc-card-table-cell-actions-button-${props.card.id}`}
              actions={[
                {
                  key: 'activate',
                  label: t('nfcCardsTable.actions.activate'),
                  icon: <CheckIcon className="w-4 h-4" />,
                  onPress: onOpen,
                  dataCy: `nfc-card-table-cell-activate-button-${props.card.id}`,
                },
                {
                  key: 'delete',
                  label: t('nfcCardsTable.actions.delete'),
                  icon: <Trash2Icon className="w-4 h-4" />,
                  variant: 'destructive',
                  onPress: props.onDeleteClick,
                  dataCy: `nfc-card-table-cell-delete-button-${props.card.id}`,
                },
              ]}
            />
          )}
        </NfcCardActivateModal>
      )
    );
  }

  if (props.header === 'uid') {
    return props.card.uid;
  }

  if (props.header === 'id') {
    return props.card.id;
  }

  if (props.header === 'lastSeen') {
    return <DateTimeDisplay date={props.card.lastSeen} />;
  }

  if (props.header === 'createdAt') {
    return <DateTimeDisplay date={props.card.createdAt} />;
  }

  if (props.header === 'user') {
    return <AttraccessUser user={props.card.user} />;
  }

  return props.card[props.header as keyof NFCCard] as React.ReactNode;
};

interface EnrollNfcCardProps {
  children: (onOpen: () => void) => React.ReactNode;
}

const EnrollNfcCard = ({ children }: EnrollNfcCardProps) => {
  const { t } = useTranslations({
    de,
    en,
  });

  const [show, setShow] = useState(false);
  const [readerId, setReaderId] = useState<number | null>(null);

  const { mutate: enrollNfcCardMutation } = useAttractapServiceEnrollNfcCard();

  const close = useCallback(() => setShow(false), []);

  const enrollNfcCard = useCallback(() => {
    if (!readerId) {
      return;
    }

    enrollNfcCardMutation({ requestBody: { readerId } });
    close();
  }, [readerId, enrollNfcCardMutation, close]);

  return (
    <>
      {children(() => setShow(true))}
      <StandardDrawer
        isOpen={show}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DrawerHeader>
          <div className="flex w-full items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('enrollModal.title')}</h2>
            <Button isIconOnly variant="ghost" aria-label={t('enrollModal.cancel')} onPress={close}>
              <XIcon size={16} />
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody>
          <p>{t('enrollModal.description')}</p>
          <AttractapSelect
            label={t('enrollModal.readerLabel')}
            placeholder={t('enrollModal.readerPlaceholder')}
            selection={readerId}
            onSelectionChange={(readerId) => setReaderId(readerId ?? null)}
            data-cy="enroll-nfc-card-modal-reader-select"
            requiredCapabilities={{ cardEnrollment: true }}
          />
        </DrawerBody>
        <DrawerFooter>
          <Button variant="secondary" onPress={close} data-cy="enroll-nfc-card-modal-cancel-button">
            {t('enrollModal.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!readerId}
            onPress={enrollNfcCard}
            data-cy="enroll-nfc-card-modal-enroll-button"
          >
            {t('enrollModal.enroll')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </>
  );
};

export function NfcCardList() {
  const { t } = useTranslations({
    de,
    en,
  });

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
              isHidden: !hasPermission('canManageResources'),
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
