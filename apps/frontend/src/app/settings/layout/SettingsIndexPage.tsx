import { ActivityIcon, FileClockIcon, InfoIcon, LockKeyholeIcon, MailIcon, MessageSquareIcon, PlugIcon, Settings2Icon, ShieldIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import { useSettingsSections } from './useSettingsSections';
import en from './en.json';
import de from './de.json';
import { SettingsDirectory, type SettingsDirectoryGroup } from '../../../components/settingsDirectory';

const sectionIcons = {
  general: Settings2Icon,
  email: MailIcon,
  messaging: MessageSquareIcon,
  about: InfoIcon,
  security: LockKeyholeIcon,
  roles: UsersIcon,
  sso: ShieldIcon,
  monitoring: ActivityIcon,
  auditLog: FileClockIcon,
  plugins: PlugIcon,
} as const;

/** The same searchable directory as personal account settings, filtered by section permissions. */
export function SettingsIndexPage() {
  const { t } = useTranslations({ en, de });
  const { groups } = useSettingsSections();

  const directoryGroups: SettingsDirectoryGroup[] = groups.map((group) => ({
    key: group.key,
    label: t(`groups.${group.key}`),
    items: group.sections.map((section) => {
      const Icon = sectionIcons[section.key as keyof typeof sectionIcons];
      return {
        key: section.key,
        title: t(`sections.${section.key}.label`),
        description: t(`sections.${section.key}.description`),
        icon: Icon && <Icon size={19} />,
        to: section.path,
      };
    }),
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
