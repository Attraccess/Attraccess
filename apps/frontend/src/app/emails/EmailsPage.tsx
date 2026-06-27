import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MailIcon, Layout, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@heroui/react';
import { PageHeader } from '../../components/pageHeader';
import { SmtpSettingsCard } from '../settings/cards/SmtpSettingsCard';
import en from './en.json';
import de from './de.json';

export function EmailsPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<MailIcon size={20} />} />

      <div className="flex flex-col gap-6">
        <SmtpSettingsCard variant="standalone" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer"
            onClick={() => navigate('/emails/templates')}
            role="button"
            tabIndex={0}
            data-cy="emails-nav-templates"
          >
            <Card.Header className="flex items-center gap-3">
              <Mail size={20} className="text-default-600 shrink-0" />
              <div>
                <Card.Title className="text-sm">{t('subPages.templates.title')}</Card.Title>
                <Card.Description className="text-xs">{t('subPages.templates.description')}</Card.Description>
              </div>
            </Card.Header>
          </Card>

          <Card
            className="cursor-pointer"
            onClick={() => navigate('/emails/layout')}
            role="button"
            tabIndex={0}
            data-cy="emails-nav-layout"
          >
            <Card.Header className="flex items-center gap-3">
              <Layout size={20} className="text-default-600 shrink-0" />
              <div>
                <Card.Title className="text-sm">{t('subPages.layout.title')}</Card.Title>
                <Card.Description className="text-xs">{t('subPages.layout.description')}</Card.Description>
              </div>
            </Card.Header>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default EmailsPage;
