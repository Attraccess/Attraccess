import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip } from '@heroui/react';
import { CheckIcon, MailIcon, Layout, Mail, XIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';
import { PageHeader, PageAction } from '../../components/pageHeader';
import { SmtpSettingsForm } from '../settings/forms/SmtpSettingsForm';
import en from './en.json';
import de from './de.json';

export function EmailsPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { data: settings } = useSettingsServiceGetSystemSettings();

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MailIcon size={20} />}
        actions={[
          {
            key: 'templates',
            label: t('subPages.templates.title'),
            icon: <Mail className="w-4 h-4" />,
            onPress: () => navigate('/emails/templates'),
          },
          {
            key: 'layout',
            label: t('subPages.layout.title'),
            icon: <Layout className="w-4 h-4" />,
            onPress: () => navigate('/emails/layout'),
          },
        ] satisfies PageAction[]}
      />

      {/* No Card wrapper and no "Email (SMTP)" heading — the page title already says it. */}
      <div className="flex flex-col gap-4" data-cy="smtp-settings-section">
        {settings && (
          <Chip color={settings.smtp.passConfigured ? 'success' : 'warning'} variant="soft" className="self-start">
            <div className="flex items-center gap-2">
              {settings.smtp.passConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
              {settings.smtp.passConfigured ? t('passwordStatus.configured') : t('passwordStatus.missing')}
            </div>
          </Chip>
        )}
        <SmtpSettingsForm variant="standalone" endpoint="settings" />
      </div>
    </div>
  );
}

export default EmailsPage;
