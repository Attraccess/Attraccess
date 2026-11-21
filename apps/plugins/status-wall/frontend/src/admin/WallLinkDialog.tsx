import { Button, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Input } from '@heroui/react';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { wallLink, type Wall } from '../api';
import { useStatusWallTranslations } from '../i18n';

/** The public link of a wall, to copy onto a screen or open right here. */
export function WallLinkDialog(props: Readonly<{ wall: Wall | null; onClose: () => void }>) {
  const { t } = useStatusWallTranslations();
  const [copied, setCopied] = useState(false);
  const { wall } = props;
  const link = wall ? wallLink(wall.token) : '';

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <StatusDialog
      isOpen={wall !== null}
      onClose={() => {
        setCopied(false);
        props.onClose();
      }}
      status="info"
      title={t('link.title', { name: wall?.name ?? '' })}
      closeLabel={t('common.done')}
      data-cy="status-wall-link"
    >
      <div className="sw:flex sw:flex-col sw:gap-3">
        <p>{t('link.body')}</p>
        <Input
          readOnly
          fullWidth
          value={link}
          aria-label={t('link.url')}
          onFocus={(event) => event.currentTarget.select()}
          data-cy="status-wall-link-url"
        />
        <div className="sw:flex sw:flex-wrap sw:gap-2">
          <Button variant="secondary" onPress={() => void copy()} data-cy="status-wall-link-copy">
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
            <span aria-live="polite">{copied ? t('link.copied') : t('link.copy')}</span>
          </Button>
          <Button variant="tertiary" onPress={() => window.open(link, '_blank', 'noopener')}>
            <ExternalLinkIcon size={16} />
            {t('link.open')}
          </Button>
        </div>
      </div>
    </StatusDialog>
  );
}
