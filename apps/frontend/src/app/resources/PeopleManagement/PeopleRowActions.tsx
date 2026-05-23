import { Button, Tooltip } from '@heroui/react';
import { HistoryIcon, ShieldCheckIcon, ShieldOffIcon, Trash2Icon } from 'lucide-react';
import { User } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';
import { PersonRow } from './types';

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
    <div className="flex gap-2 flex-wrap">
      {row.introduction && (
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              isIconOnly
              onPress={() => onOpenHistory(row.user.id)}
              aria-label={t('rowActions.history')}
              data-cy={`people-row-history-${row.user.id}`}
            >
              <HistoryIcon className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('rowActions.history')}</Tooltip.Content>
        </Tooltip>
      )}

      {canManageIntroductions &&
        (row.hasValidIntroduction ? (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                variant="ghost"
                isIconOnly
                isPending={isRevokingIntroduction && pendingIntroductionUserId === row.user.id}
                onPress={() => onToggleIntroduction(row.user, 'revoke')}
                aria-label={t('rowActions.revokeIntroduction')}
                data-cy={`people-row-revoke-introduction-${row.user.id}`}
              >
                <ShieldOffIcon className="w-4 h-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{t('rowActions.revokeIntroduction')}</Tooltip.Content>
          </Tooltip>
        ) : row.introduction ? (
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                variant="ghost"
                isIconOnly
                isPending={isGrantingIntroduction && pendingIntroductionUserId === row.user.id}
                onPress={() => onToggleIntroduction(row.user, 'grant')}
                aria-label={t('rowActions.grantIntroduction')}
                data-cy={`people-row-grant-introduction-${row.user.id}`}
              >
                <ShieldCheckIcon className="w-4 h-4" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{t('rowActions.grantIntroduction')}</Tooltip.Content>
          </Tooltip>
        ) : null)}

      {canManageIntroducers && row.isIntroducer && (
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              isIconOnly
              isPending={isRevokingIntroducer && pendingIntroducerUserId === row.user.id}
              onPress={() => onRevokeIntroducer(row.user.id)}
              aria-label={t('rowActions.revokeIntroducer')}
              data-cy={`people-row-revoke-introducer-${row.user.id}`}
            >
              <Trash2Icon className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('rowActions.revokeIntroducer')}</Tooltip.Content>
        </Tooltip>
      )}
    </div>
  );
}
