import { Link, Navigate } from 'react-router-dom';
import { ChevronRightIcon, Settings2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import { useSettingsSections } from './useSettingsSections';
import en from './en.json';
import de from './de.json';
import { useIsDesktop } from '../../../hooks/useIsDesktop';

/**
 * `/settings` itself. On a desktop it is a redirect — the rail is the navigation, so a landing page
 * beside it would be a second one. On a phone there is no rail, so this *is* the navigation.
 *
 * The redirect targets the first *permitted* section rather than General: an operator without that
 * permission would otherwise land on a 403 the moment they opened Settings.
 */
export function SettingsIndexPage() {
  const { t } = useTranslations({ en, de });
  const isDesktop = useIsDesktop();
  const { sections, groups } = useSettingsSections();

  if (isDesktop && sections.length > 0) {
    return <Navigate to={sections[0].path} replace />;
  }

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />

      <nav aria-label={t('navLabel')} className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t(`groups.${group.key}`)}
            </div>
            {group.sections.map((section) => (
              <Link
                key={section.key}
                to={section.path}
                className="flex items-center justify-between gap-4 border-b border-separator py-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{t(`sections.${section.key}.label`)}</span>
                  <span className="text-xs text-muted">{t(`sections.${section.key}.description`)}</span>
                </span>
                <ChevronRightIcon size={16} className="shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

export default SettingsIndexPage;
