import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import { useOverlayState } from '@heroui/react';
import { Button } from '../../../components/button';
import { AlertCircle, AwardIcon, ShieldCheckIcon, WrenchIcon } from 'lucide-react';
import { User } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Select } from '../../../components/select';
import { AddPersonDrawer } from './AddPersonDrawer';
import { HistoryModalLoader } from './HistoryModalLoader';
import { IntroductionCommentModal } from './IntroductionCommentModal';
import { PeopleHeader } from './PeopleHeader';
import { PeopleTable } from './PeopleTable';
import { usePeopleMutations } from './usePeopleMutations';
import { usePeopleRows } from './usePeopleRows';
import { AddMode, FilterMode, PeopleManagementProps } from './types';
import en from './en.json';
import de from './de.json';

export function PeopleManagement(
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
    async (user: User) => {
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

  if (hasError) {
    return (
      <section className={className} {...(rest as HTMLAttributes<HTMLElement>)}>
        <div className="flex items-center gap-3 p-2">
          <AlertCircle size={20} className="text-danger" />
          <div>
            <p className="font-medium text-danger">{t('loadError')}</p>
            <p className="text-sm text-foreground-500">{t('loadErrorDescription')}</p>
          </div>
        </div>
      </section>
    );
  }

  const header = (
    <PeopleHeader
      t={t}
      canManageIntroducers={canManageIntroducers}
      canManageIntroductions={canManageIntroductions}
      onAdd={handleAddOpen}
    />
  );

  const body = (
    <>
      <Select
        aria-label={t('filters.all')}
        value={filter}
        onChange={(key) => setFilter(key as FilterMode)}
        items={[
          { key: 'all', label: t('filters.all') },
          { key: 'introducers', label: t('filters.introducers') },
          { key: 'maintainers', label: t('filters.maintainers') },
          { key: 'introduced', label: t('filters.introduced') },
        ]}
        data-cy="people-filter"
        className="max-w-xs"
      />

      <PeopleTable
        t={t}
        rows={filteredRows}
        isLoading={isLoading}
        canManageIntroducers={canManageIntroducers}
        canManageIntroductions={canManageIntroductions}
        pendingIntroducer={mutations.pendingIntroducer}
        pendingIntroductionUserId={mutations.pendingIntroductionUserId}
        isRevokingIntroducer={mutations.isRevokingIntroducer}
        isGrantingIntroduction={mutations.isGrantingIntroduction}
        isRevokingIntroduction={mutations.isRevokingIntroduction}
        onOpenHistory={handleHistoryOpen}
        onToggleIntroduction={handleIntroductionToggle}
        onRevokeIntroducer={mutations.revokeIntroducer}
      />
    </>
  );

  const modals = (
    <>
      <AddPersonDrawer
        t={t}
        isOpen={isAddOpen}
        mode={addMode}
        comment={addComment}
        isPending={mutations.isMutating}
        onCommentChange={setAddComment}
        onAdd={handleAdd}
        onClose={() => {
          closeAdd();
          resetAddState();
        }}
      />

      <IntroductionCommentModal
        t={t}
        isOpen={isRevokeOpen}
        comment={revokeComment}
        isPending={mutations.isMutating}
        onCommentChange={setRevokeComment}
        onSubmit={handleRevokeSubmit}
        onClose={() => {
          closeRevoke();
          setRevokeContext(null);
          setRevokeComment('');
        }}
      />

      {historyUserId !== null && (
        <HistoryModalLoader
          target={target}
          userId={historyUserId}
          isOpen={isHistoryOpen}
          onClose={() => {
            closeHistory();
            setHistoryUserId(null);
          }}
        />
      )}
    </>
  );

  if (hideHeader) {
    const addButtons = (
      <div className="flex flex-wrap gap-2">
        {canManageIntroductions && (
          <Button variant="primary" onPress={() => handleAddOpen('introduction')} data-cy="people-add-introduction">
            <ShieldCheckIcon className="w-4 h-4" />
            {t('addOptions.introduction')}
          </Button>
        )}
        {canManageIntroducers && (
          <>
            <Button variant="primary" onPress={() => handleAddOpen('introducer')} data-cy="people-add-introducer">
              <AwardIcon className="w-4 h-4" />
              {t('addOptions.introducer')}
            </Button>
            <Button variant="primary" onPress={() => handleAddOpen('maintainer')} data-cy="people-add-maintainer">
              <WrenchIcon className="w-4 h-4" />
              {t('addOptions.maintainer')}
            </Button>
          </>
        )}
      </div>
    );

    return (
      <section className={className} {...(rest as HTMLAttributes<HTMLElement>)}>
        <div className="flex justify-end mb-4">{addButtons}</div>
        <div className="flex flex-col gap-4">{body}</div>
        {modals}
      </section>
    );
  }

  return (
    <section className={className} {...(rest as HTMLAttributes<HTMLElement>)}>
      {header}
      <div className="flex flex-col gap-4 mt-4">{body}</div>
      {modals}
    </section>
  );
}
