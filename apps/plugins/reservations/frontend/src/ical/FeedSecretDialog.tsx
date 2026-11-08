import { Button, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Input } from '@heroui/react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useReservationsTranslations } from '../i18n';
import type { IcalFeedSecret } from '../lib/types';

/** Shows a feed URL exactly once, right after it was created or regenerated. */
export function FeedSecretDialog(props: Readonly<{ secret: IcalFeedSecret | null; onClose: () => void }>) {
  const { t } = useReservationsTranslations();
  const [copied, setCopied] = useState(false);
  const { secret } = props;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <StatusDialog
      isOpen={secret !== null}
      onClose={() => {
        setCopied(false);
        props.onClose();
      }}
      status="success"
      title={t('feeds.secret.title', { name: secret?.feed.name ?? '' })}
      closeLabel={t('common.done')}
      data-cy="reservations-feed-secret"
    >
      <div className="rv:flex rv:flex-col rv:gap-3">
        <p>{t('feeds.secret.body')}</p>
        <div className="rv:flex rv:items-center rv:gap-2">
          <Input
            readOnly
            fullWidth
            value={secret?.url ?? ''}
            aria-label={t('feeds.secret.url')}
            onFocus={(event) => event.currentTarget.select()}
            data-cy="reservations-feed-url"
          />
          <Button
            variant="secondary"
            className="rv:shrink-0"
            onPress={() => void copy()}
            data-cy="reservations-feed-copy"
          >
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            <span aria-live="polite">{copied ? t('feeds.secret.copied') : t('feeds.secret.copy')}</span>
          </Button>
        </div>
      </div>
    </StatusDialog>
  );
}
