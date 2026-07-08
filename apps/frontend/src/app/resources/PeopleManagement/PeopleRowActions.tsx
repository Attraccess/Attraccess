import { HistoryIcon, ShieldCheckIcon, ShieldOffIcon, Trash2Icon } from 'lucide-react';
import { User } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PersonRow } from './types';
import { TableRowActions } from '../../../components/tableRowActions';

interface PeopleRowActionsProps {
  t: TFunction;
  row: PersonRow;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
  pendingIntroducerUserId: number | null;
  pendingIntroductionUserId: number | null;
  isRevokingIntroducer: boolean;
  isGrantingIntroduction: boolean;
  isRevokingIntroduction: boolean;
  onOpenHistory: (userId: number) => void;
  onToggleIntroduction: (user: User, action: 'grant' | 'revoke') => void;
  onRevokeIntroducer: (userId: number) => void;
}

export function PeopleRowActions(props: Readonly<PeopleRowActionsProps>) {
  const {
    t,
    row,
    canManageIntroducers,
    canManageIntroductions,
    pendingIntroducerUserId,
    pendingIntroductionUserId,
    isRevokingIntroducer,
    isGrantingIntroduction,
    isRevokingIntroduction,
    onOpenHistory,
    onToggleIntroduction,
    onRevokeIntroducer,
  } = props;

  return (
    <TableRowActions
      ariaLabel={t('columns.actions')}
      triggerDataCy={`people-row-actions-${row.user.id}`}
      actions={[
        row.introduction && {
          key: 'history',
          label: t('rowActions.history'),
          icon: <HistoryIcon className="w-4 h-4" />,
          onPress: () => onOpenHistory(row.user.id),
          dataCy: `people-row-history-${row.user.id}`,
        },
        canManageIntroductions &&
          row.hasValidIntroduction && {
            key: 'revoke-introduction',
            label: t('rowActions.revokeIntroduction'),
            icon: <ShieldOffIcon className="w-4 h-4" />,
            isPending: isRevokingIntroduction && pendingIntroductionUserId === row.user.id,
            onPress: () => onToggleIntroduction(row.user, 'revoke'),
            dataCy: `people-row-revoke-introduction-${row.user.id}`,
          },
        canManageIntroductions &&
          !row.hasValidIntroduction &&
          row.introduction && {
            key: 'grant-introduction',
            label: t('rowActions.grantIntroduction'),
            icon: <ShieldCheckIcon className="w-4 h-4" />,
            isPending: isGrantingIntroduction && pendingIntroductionUserId === row.user.id,
            onPress: () => onToggleIntroduction(row.user, 'grant'),
            dataCy: `people-row-grant-introduction-${row.user.id}`,
          },
        canManageIntroducers &&
          row.introducer && {
            key: 'revoke-introducer',
            label: row.isMaintainer ? t('rowActions.revokeMaintainer') : t('rowActions.revokeIntroducer'),
            icon: <Trash2Icon className="w-4 h-4" />,
            variant: 'destructive',
            isPending: isRevokingIntroducer && pendingIntroducerUserId === row.user.id,
            onPress: () => onRevokeIntroducer(row.user.id),
            dataCy: `people-row-revoke-introducer-${row.user.id}`,
          },
      ]}
    />
  );
}
