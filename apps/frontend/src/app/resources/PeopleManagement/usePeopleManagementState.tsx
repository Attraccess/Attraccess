import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import { useOverlayState } from '@heroui/react';
import { User } from '@attraccess/react-query-client';
import { type UserIdentity, useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePeopleMutations } from './usePeopleMutations';
import { usePeopleRows } from './usePeopleRows';
import { AddMode, FilterMode, PeopleManagementProps } from './types';
import en from './en.json';
import de from './de.json';
export function usePeopleManagementState(
  props: Readonly<PeopleManagementProps & Omit<HTMLAttributes<HTMLElement>, 'children'>>,
) {
  const { target, canManageIntroducers, canManageIntroductions, hideHeader, className, ...rest } = props;
  const { t } = useTranslations({ en, de });

  const [filter, setFilter] = useState<FilterMode>('all');
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [addComment, setAddComment] = useState('');
  const { isOpen: isAddOpen, open: openAdd, close: closeAdd } = useOverlayState();

  const [revokeContext, setRevokeContext] = useState<{ user: User; action: 'grant' | 'revoke' } | null>(null);
  const [revokeComment, setRevokeComment] = useState('');
  const { isOpen: isRevokeOpen, open: openRevoke, close: closeRevoke } = useOverlayState();

  const [historyUserId, setHistoryUserId] = useState<number | null>(null);
  const { isOpen: isHistoryOpen, open: openHistory, close: closeHistory } = useOverlayState();

  const { rows, isLoading, hasError } = usePeopleRows({ target });

  const mutations = usePeopleMutations({ target, t });

  const filteredRows = useMemo(() => {
    if (filter === 'introducers') return rows.filter((r) => r.isIntroducer);
    if (filter === 'maintainers') return rows.filter((r) => r.isMaintainer);
    if (filter === 'introduced') return rows.filter((r) => r.hasValidIntroduction);
    return rows;
  }, [rows, filter]);

  const handleAddOpen = useCallback(
    (mode: AddMode) => {
      setAddMode(mode);
      setAddComment('');
      openAdd();
    },
    [openAdd],
  );

  const resetAddState = useCallback(() => {
    setAddComment('');
    setAddMode(null);
  }, []);

  const handleAdd = useCallback(
    async (user: UserIdentity) => {
      if (!addMode) return;
      if (addMode === 'introducer') {
        await mutations.grantIntroducer(user.id);
      } else if (addMode === 'maintainer') {
        await mutations.grantMaintainer(user.id);
      } else {
        await mutations.grantIntroduction(user.id, addComment);
      }
    },
    [addMode, addComment, mutations],
  );

  const handleIntroductionToggle = useCallback(
    (user: User, action: 'grant' | 'revoke') => {
      setRevokeContext({ user, action });
      setRevokeComment('');
      openRevoke();
    },
    [openRevoke],
  );

  const handleRevokeSubmit = useCallback(async () => {
    if (!revokeContext) return;
    const { user, action } = revokeContext;
    if (action === 'grant') {
      await mutations.grantIntroduction(user.id, revokeComment);
    } else {
      await mutations.revokeIntroduction(user.id, revokeComment);
    }
    setRevokeContext(null);
    setRevokeComment('');
    closeRevoke();
  }, [revokeContext, revokeComment, mutations, closeRevoke]);

  const handleHistoryOpen = useCallback(
    (userId: number) => {
      setHistoryUserId(userId);
      openHistory();
    },
    [openHistory],
  );
  return {
    target,
    canManageIntroducers,
    canManageIntroductions,
    hideHeader,
    className,
    rest,
    t,
    filter,
    setFilter,
    addMode,
    addComment,
    setAddComment,
    isAddOpen,
    closeAdd,
    setRevokeContext,
    revokeComment,
    setRevokeComment,
    isRevokeOpen,
    closeRevoke,
    historyUserId,
    setHistoryUserId,
    isHistoryOpen,
    closeHistory,
    rows,
    isLoading,
    hasError,
    mutations,
    filteredRows,
    handleAddOpen,
    resetAddState,
    handleAdd,
    handleIntroductionToggle,
    handleRevokeSubmit,
    handleHistoryOpen,
  } as const;
}
