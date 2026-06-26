import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MailIcon, Layout, Mail, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/pageHeader';
import { SmtpSettingsCard } from '../settings/cards/SmtpSettingsCard';
import en from './en.json';
import de from './de.json';

function NavCard({ icon, title, description, onClick, dataCy }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  dataCy: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-cy={dataCy}
      className="w-full text-left rounded-large border border-default-200 bg-default-50 p-6 hover:bg-default-100 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-default-600 mt-0.5 shrink-0">{icon}</span>
          <div>
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-xs text-default-500 mt-1">{description}</p>
          </div>
        </div>
        <ArrowRight size={16} className="text-default-400 shrink-0 mt-0.5" />
      </div>
    </button>
  );
}

export function EmailsPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<MailIcon size={20} />} />

      <div className="flex flex-col gap-6">
        <SmtpSettingsCard variant="standalone" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NavCard
            icon={<Mail size={20} />}
            title={t('subPages.templates.title')}
            description={t('subPages.templates.description')}
            onClick={() => navigate('/emails/templates')}
            dataCy="emails-nav-templates"
          />
          <NavCard
            icon={<Layout size={20} />}
            title={t('subPages.layout.title')}
            description={t('subPages.layout.description')}
            onClick={() => navigate('/emails/layout')}
            dataCy="emails-nav-layout"
          />
        </div>
      </div>
    </div>
  );
}

export default EmailsPage;
