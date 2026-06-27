import { Layout } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { EmailLayoutEditor } from './EmailLayoutEditor';
import en from './en.json';
import de from './de.json';

export function EmailLayoutPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Layout size={20} />}
        backTo="/emails"
      />
      <EmailLayoutEditor />
    </div>
  );
}

export default EmailLayoutPage;
