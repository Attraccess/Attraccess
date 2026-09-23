import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

/**
 * Section pages share a back link to the searchable settings directory.
 *
 * Wraps its own children per route rather than nesting them under an `<Outlet />`, matching
 * `ResourceTabsLayout` — `RouteConfig` is a flat list and has no notion of nested routes.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/settings"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ChevronLeftIcon size={16} />
        {t('backToSettings')}
      </Link>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
