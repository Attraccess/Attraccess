import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  cn,
} from '@heroui/react';
import { StandardDrawer } from '../../../components/standardDrawer';
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
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';
import { PageAction, PageHeader } from '../../../components/pageHeader';
import { useAuth } from '../../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

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
    <Modal
      isOpen={props.show}
      onOpenChange={(open) => {
        if (!open) props.close();
      }}
      data-cy="nfc-card-delete-modal"
    >
      <ModalBackdrop>
        <ModalContainer size="md">
          <ModalDialog>
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
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
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
      <div className="flex gap-2 flex-row flex-wrap">
        <Button
          variant="danger-soft"
          onPress={() => props.onDeleteClick()}
          data-cy={`nfc-card-table-cell-delete-button-${props.card.id}`}
        >
          <Trash2Icon />
          {t('nfcCardsTable.actions.delete')}
        </Button>
        {props.card.isActive ? (
          <NfcCardDeactivateModal cardId={props.card.id}>
            {(onOpen) => (
              <Button
                variant="tertiary"
                onPress={onOpen}
                data-cy={`nfc-card-table-cell-deactivate-button-${props.card.id}`}
              ><CheckIcon />
                <XIcon />
                {t('nfcCardsTable.actions.deactivate')}
              </Button>
            )}
          </NfcCardDeactivateModal>
        ) : (
          <NfcCardActivateModal cardId={props.card.id}>
            {(onOpen) => (
              <Button
                variant="tertiary"
                onPress={onOpen}
                data-cy={`nfc-card-table-cell-activate-button-${props.card.id}`}
              ><XIcon />
                <CheckIcon />
                {t('nfcCardsTable.actions.activate')}
              </Button>
            )}
          </NfcCardActivateModal>
        )}
      </div>
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
        actions={[
          {
            key: 'enroll',
            label: t('enroll'),
            icon: <PlusIcon />,
            variant: 'primary',
            dataCy: 'enroll-nfc-card-button-trigger',
            renderTrigger: (triggerProps) => (
              <EnrollNfcCard>
                {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
              </EnrollNfcCard>
            ),
          },
          {
            key: 'readers',
            label: t('readers'),
            icon: <ServerIcon />,
            isHidden: !hasPermission('canManageResources'),
            onPress: () => navigate('/attractap/readers'),
          },
        ] satisfies PageAction[]}
      />

      <Alert status="warning" className="mb-4">
        <AlertStatusIcon status="warning" />
        <AlertContent>
          <AlertTitle>{t('workInProgressTitle')}</AlertTitle>
          <AlertDescription>{t('workInProgress')}</AlertDescription>
        </AlertContent>
      </Alert>

      <NfcCardDeleteModal
        show={cardToDeleteId !== null}
        close={() => setCardToDeleteId(null)}
        cardId={cardToDeleteId}
      />

      <Table data-cy="nfc-card-list-table">
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
      </Table>
    </>
  );
}
