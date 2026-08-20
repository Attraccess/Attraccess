import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { NfcKeychainCard } from './NfcKeychainCard';
import de from './de.json';
import en from './en.json';

// One model today. A second one becomes a HeroUI Tabs wrapper around these cards.
export default function PrintablesPage() {
  const { t } = useTranslations({ de, en });

  return (
    <div>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />
      <NfcKeychainCard />
    </div>
  );
}
