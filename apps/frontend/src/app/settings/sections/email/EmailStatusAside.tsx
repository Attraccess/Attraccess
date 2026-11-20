import { Link } from 'react-router-dom';
import { Chip } from '@heroui/react';
import { CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

/** Whether a password is stored, and links to the template and layout editors. */
export function EmailStatusAside({ passConfigured }: { passConfigured: boolean | undefined }) {
  const { t } = useTranslations({ en, de });
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('aside.statusTitle')}</h3>
        <div>
          <Chip color={passConfigured ? 'success' : 'warning'} variant="soft">
            <span className="flex items-center gap-1">
              {passConfigured ? <CheckIcon size={14} /> : <XIcon size={14} />}
              {passConfigured ? t('passwordStatus.configured') : t('passwordStatus.missing')}
            </span>
          </Chip>
        </div>
        <p className="text-xs text-muted">{t('aside.statusHint')}</p>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{t('aside.contentTitle')}</h3>
        {(
          [
            { to: '/settings/email/templates', key: 'templates' },
            { to: '/settings/email/layout', key: 'layout' },
          ] as const
        ).map(({ to, key }) => (
          <Link
            key={key}
            to={to}
            className="flex items-center justify-between gap-2 border-b border-separator py-2 last:border-b-0"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">{t(`subPages.${key}.title`)}</span>
              <span className="text-xs text-muted">{t(`subPages.${key}.description`)}</span>
            </span>
            <ChevronRightIcon size={16} className="shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </>
  );
}
