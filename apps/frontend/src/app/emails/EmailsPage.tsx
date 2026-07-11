import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MailIcon, Layout, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, PageAction } from '../../components/pageHeader';
import { SmtpSettingsCard } from '../settings/cards/SmtpSettingsCard';
import en from './en.json';
import de from './de.json';

export function EmailsPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

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

      <SmtpSettingsCard variant="standalone" />
    </div>
  );
}

export default EmailsPage;
