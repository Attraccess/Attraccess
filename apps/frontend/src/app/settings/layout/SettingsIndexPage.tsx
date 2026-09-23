import { Navigate } from 'react-router-dom';
import { Settings2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import { useSettingsSections } from './useSettingsSections';
import en from './en.json';
import de from './de.json';
import { useIsDesktop } from '../../../hooks/useIsDesktop';
import { SettingsDirectory, type SettingsDirectoryGroup } from '../../../components/settingsDirectory';

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

  const directoryGroups: SettingsDirectoryGroup[] = groups.map((group) => ({
    key: group.key,
    label: t(`groups.${group.key}`),
    items: group.sections.map((section) => ({
      key: section.key,
      title: t(`sections.${section.key}.label`),
      description: t(`sections.${section.key}.description`),
      to: section.path,
    })),
  }));

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />

      <nav aria-label={t('navLabel')}>
        <SettingsDirectory groups={directoryGroups} searchLabel={t('search')} emptyMessage={t('noResults')} />
      </nav>
    </div>
  );
}

export default SettingsIndexPage;
