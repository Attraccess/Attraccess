import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@heroui/react';
import { ChevronLeftIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSettingsSections } from './useSettingsSections';
import en from './en.json';
import de from './de.json';

/**
 * The settings shell: a permission-filtered rail on `sm+`, a back link below it.
 *
 * Wraps its own children per route rather than nesting them under an `<Outlet />`, matching
 * `ResourceTabsLayout` — `RouteConfig` is a flat list and has no notion of nested routes.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslations({ en, de });
  const { groups } = useSettingsSections();
  const { pathname } = useLocation();

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground sm:hidden"
      >
        <ChevronLeftIcon size={16} />
        {t('backToSettings')}
      </Link>

      <nav aria-label={t('navLabel')} className="hidden w-56 shrink-0 flex-col gap-6 sm:flex">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1">
            <div className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {t(`groups.${group.key}`)}
            </div>
            {group.sections.map((section) => {
              // Sub-routes count as the section: Email owns /settings/email/templates and
              // /settings/email/layout, and an exact match would leave the rail with nothing
              // highlighted the moment the operator opened one of them.
              const isActive = pathname === section.path || pathname.startsWith(`${section.path}/`);
              return (
                <Link
                  key={section.key}
                  to={section.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    isActive
                      ? 'bg-accent-soft font-medium text-accent-soft-foreground'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {t(`sections.${section.key}.label`)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
