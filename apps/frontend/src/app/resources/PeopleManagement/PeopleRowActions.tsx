import { useCallback, useRef } from 'react';
import { formatUserDisplayName } from '@attraccess/shared';
import { HistoryIcon, ShieldCheckIcon, ShieldOffIcon, UserMinusIcon } from 'lucide-react';
import { ResourceIntroducerType, User } from '@attraccess/react-query-client';
import { TableRowAction, TableRowActions, useTranslations } from '@attraccess/plugins-frontend-ui';
import { IntroductionCommentField } from './IntroductionCommentField';
import { PeopleTarget, PersonRow } from './types';
import en from './en.json';
import de from './de.json';

interface PeopleRowActionsProps {
  target: PeopleTarget;
  row: PersonRow;
  canManageIntroducers: boolean;
  canManageIntroductions: boolean;
  pendingIntroducer: { userId: number; type: ResourceIntroducerType } | null;
  pendingIntroductionUserId: number | null;
  isRevokingIntroducer: boolean;
  isGrantingIntroduction: boolean;
  isRevokingIntroduction: boolean;
  onOpenHistory: (userId: number) => void;
  onChangeIntroduction: (user: User, action: 'grant' | 'revoke', comment: string) => Promise<void>;
  onRevokeIntroducer: (userId: number, type: ResourceIntroducerType) => Promise<void>;
}

export function PeopleRowActions(props: Readonly<PeopleRowActionsProps>) {
  const {
    target,
    row,
    canManageIntroducers,
    canManageIntroductions,
    pendingIntroducer,
    pendingIntroductionUserId,
    isRevokingIntroducer,
    isGrantingIntroduction,
    isRevokingIntroduction,
    onOpenHistory,
    onChangeIntroduction,
    onRevokeIntroducer,
  } = props;
  // React escapes the output; escaping the username again would show `&amp;` in the confirmations.
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  // The confirm dialog keeps a snapshot of its content, so the comment is read from a ref when confirmed.
  const commentRef = useRef('');
  const setComment = useCallback((comment: string) => {
    commentRef.current = comment;
  }, []);
  const name = formatUserDisplayName(row.user);
  const isIntroductionPending = pendingIntroductionUserId === row.user.id;
  const revokeIntroductionLabel = t(
    target.type === 'resource' ? 'rowActions.revokeDirectIntroduction' : 'rowActions.revokeIntroduction',
  );

  const commentField = (message: string) => <IntroductionCommentField message={message} onCommentChange={setComment} />;

  const introductionAction = (): TableRowAction | null => {
    if (!canManageIntroductions) return null;
    if (row.hasValidDirectIntroduction) {
      return {
        key: 'revoke-introduction',
        label: revokeIntroductionLabel,
        icon: ShieldOffIcon,
        tone: 'danger',
        section: 'introduction',
        isPending: isRevokingIntroduction && isIntroductionPending,
        onPress: () => onChangeIntroduction(row.user, 'revoke', commentRef.current),
        confirm: {
          title: t('confirm.revokeIntroduction.title'),
          message: commentField(t('confirm.revokeIntroduction.message', { name })),
          confirmDataCy: 'people-revoke-submit',
        },
        'data-cy': `people-row-revoke-introduction-${row.user.id}`,
      };
    }
    if (!row.introduction) return null;
    return {
      key: 'grant-introduction',
      label: t('rowActions.grantIntroduction'),
      icon: ShieldCheckIcon,
      section: 'introduction',
      isPending: isGrantingIntroduction && isIntroductionPending,
      onPress: () => onChangeIntroduction(row.user, 'grant', commentRef.current),
      confirm: {
        title: t('confirm.grantIntroduction.title'),
        message: commentField(t('confirm.grantIntroduction.message', { name })),
        status: 'info',
        confirmDataCy: 'people-grant-submit',
      },
      'data-cy': `people-row-grant-introduction-${row.user.id}`,
    };
  };

  const introducerActions: TableRowAction[] = canManageIntroducers
    ? row.introducers
        .filter((introducer) => target.type === 'group' || introducer.resourceId != null)
        .map((introducer): TableRowAction => {
          const isMaintainer = introducer.type === ResourceIntroducerType.MAINTAINER;
          return {
            key: `revoke-introducer-${introducer.id}`,
            label: isMaintainer ? t('rowActions.revokeMaintainer') : t('rowActions.revokeIntroducer'),
            icon: UserMinusIcon,
            tone: 'danger',
            section: 'introducer',
            isPending:
              isRevokingIntroducer &&
              pendingIntroducer?.userId === row.user.id &&
              pendingIntroducer.type === introducer.type,
            onPress: () => onRevokeIntroducer(row.user.id, introducer.type),
            confirm: {
              title: isMaintainer ? t('confirm.revokeMaintainer.title') : t('confirm.revokeIntroducer.title'),
              message: isMaintainer
                ? t('confirm.revokeMaintainer.message', { name })
                : t('confirm.revokeIntroducer.message', { name }),
              confirmDataCy: `people-row-revoke-introducer-confirm-${row.user.id}-${introducer.type}`,
            },
            'data-cy': `people-row-revoke-introducer-${row.user.id}-${introducer.type}`,
          };
        })
    : [];

  const actions: TableRowAction[] = [
    {
      key: 'history',
      label: t('rowActions.history'),
      icon: HistoryIcon,
      isHidden: !row.introduction,
      onPress: () => onOpenHistory(row.user.id),
      'data-cy': `people-row-history-${row.user.id}`,
    },
    ...[introductionAction()].filter((action): action is TableRowAction => action !== null),
    ...introducerActions,
  ];

  return (
    <TableRowActions
      itemName={name}
      sections={[
        { key: 'introduction', title: t('rowActions.sections.introduction') },
        { key: 'introducer', title: t('rowActions.sections.introducer') },
      ]}
      actions={actions}
    />
  );
}
