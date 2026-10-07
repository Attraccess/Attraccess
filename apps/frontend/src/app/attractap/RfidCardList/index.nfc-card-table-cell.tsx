import { Button } from '@heroui/react';
import { AttraccessUser, DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { NFCCard, useUsersServiceGetOneUserById } from '@attraccess/react-query-client';
import de from './de.json';
import en from './en.json';
import { NfcCardDeactivateModal } from './deactivate';
import { NfcCardActivateModal } from './activate';
import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react';
import { NfcCardTableCellProps } from './index.nfc-card-table-cell-props';

export const NfcCardTableCell = (props: NfcCardTableCellProps) => {
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
              >
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
              >
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
