import { Button, EmptyState, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Chip } from '@heroui/react';
import { useMutation } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { regenerateFeed, revokeFeed } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useFeeds, useInvalidateReservations } from '../lib/queries';
import type { IcalFeed, IcalFeedSecret } from '../lib/types';
import { useFormatters } from '../lib/useFormatters';
import { FeedFormModal } from './FeedFormModal';
import { FeedSecretDialog } from './FeedSecretDialog';

type Confirm = { kind: 'regenerate' | 'revoke'; feed: IcalFeed } | null;

/** iCal feed management: list, create, rename/re-scope, regenerate and revoke. Used by the account slot and page. */
export function IcalFeeds() {
  const { t } = useReservationsTranslations();
  const format = useFormatters();
  const feeds = useFeeds();
  const invalidate = useInvalidateReservations();
  const [formFeed, setFormFeed] = useState<IcalFeed | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [secret, setSecret] = useState<IcalFeedSecret | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async (current: NonNullable<Confirm>) =>
      current.kind === 'regenerate' ? regenerateFeed(current.feed.id) : (await revokeFeed(current.feed.id), null),
    onSuccess: async (result) => {
      setConfirm(null);
      if (result) setSecret(result);
      await invalidate();
    },
    onError: (failure) => {
      setConfirm(null);
      setError(describeError(failure, t));
    },
  });

  const describeSelection = (feed: IcalFeed) => {
    const { selection } = feed;
    if (selection.ownOnly) return t('feeds.selection.ownOnly');
    const parts: string[] = [];
    if (selection.introduced) parts.push(t('feeds.selection.introduced'));
    if (selection.maintained) parts.push(t('feeds.selection.maintained'));
    if (selection.groupIds.length) parts.push(t('feeds.selection.groups', { count: selection.groupIds.length }));
    if (selection.resourceIds.length)
      parts.push(t('feeds.selection.resources', { count: selection.resourceIds.length }));
    return parts.join(', ');
  };

  return (
    <div className="rv:flex rv:flex-col rv:gap-4" data-cy="reservations-feeds">
      <p className="rv:text-sm rv:text-muted">{t('feeds.description')}</p>
      <div>
        <Button
          variant="secondary"
          onPress={() => {
            setFormFeed(null);
            setFormOpen(true);
          }}
          data-cy="reservations-feed-create"
        >
          <PlusIcon size={16} /> {t('feeds.create')}
        </Button>
      </div>
      {feeds.isError && <p className="rv:text-sm rv:text-danger">{describeError(feeds.error, t)}</p>}
      {feeds.data?.length === 0 && <EmptyState message={t('feeds.empty')} />}
      <ul className="rv:flex rv:flex-col rv:gap-3">
        {(feeds.data ?? []).map((feed) => (
          <li
            key={feed.id}
            className="rv:flex rv:flex-wrap rv:items-center rv:justify-between rv:gap-3"
            data-cy={`reservations-feed-${feed.id}`}
          >
            <div className="rv:flex rv:min-w-0 rv:flex-col rv:gap-1">
              <span className="rv:flex rv:items-center rv:gap-2 rv:font-medium">
                {feed.name}
                {feed.revokedAt && (
                  <Chip size="sm" color="danger">
                    {t('feeds.revoked')}
                  </Chip>
                )}
              </span>
              <span className="rv:text-sm rv:text-muted">{describeSelection(feed)}</span>
              <span className="rv:text-xs rv:text-muted">
                {feed.revokedAt
                  ? t('feeds.revokedAt', { date: format.dateTime(feed.revokedAt) })
                  : feed.lastUsedAt
                    ? t('feeds.lastUsed', { date: format.dateTime(feed.lastUsedAt) })
                    : t('feeds.neverUsed')}
                {' · '}
                {feed.tokenPrefix}…
              </span>
            </div>
            {!feed.revokedAt && (
              <div className="rv:flex rv:gap-2">
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => {
                    setFormFeed(feed);
                    setFormOpen(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button size="sm" variant="secondary" onPress={() => setConfirm({ kind: 'regenerate', feed })}>
                  {t('feeds.regenerate.label')}
                </Button>
                <Button size="sm" variant="secondary" onPress={() => setConfirm({ kind: 'revoke', feed })}>
                  {t('feeds.revoke.label')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <FeedFormModal
        isOpen={formOpen}
        feed={formFeed}
        onOpenChange={setFormOpen}
        onSaved={(created) => {
          if (created) setSecret(created);
          void invalidate();
        }}
      />
      <FeedSecretDialog secret={secret} onClose={() => setSecret(null)} />
      <StatusDialog
        isOpen={confirm !== null}
        onClose={() => !run.isPending && setConfirm(null)}
        status="warning"
        title={confirm ? t(`feeds.${confirm.kind}.title`, { name: confirm.feed.name }) : ''}
        action={{
          label: confirm ? t(`feeds.${confirm.kind}.confirm`) : '',
          onPress: () => confirm && run.mutate(confirm),
          isPending: run.isPending,
        }}
        data-cy="reservations-feed-confirm"
      >
        {confirm ? t(`feeds.${confirm.kind}.body`) : ''}
      </StatusDialog>
      <StatusDialog isOpen={error !== null} onClose={() => setError(null)} status="error" title={t('feeds.failed')}>
        {error ?? ''}
      </StatusDialog>
    </div>
  );
}
