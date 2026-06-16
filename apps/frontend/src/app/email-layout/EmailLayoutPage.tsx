import { useNavigate } from 'react-router-dom';
import { Layout } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { EmailLayoutTab } from './EmailLayoutTab';

import * as enFile from './en.json';
import * as deFile from './de.json';

export function EmailLayoutPage() {
  const navigate = useNavigate();
  const { t } = useTranslations({ en: enFile, de: deFile });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Layout className="w-6 h-6" />}
        backTo="/email-templates"
      />
      <EmailLayoutTab onCancel={() => navigate('/email-templates')} />
    </div>
  );
}
