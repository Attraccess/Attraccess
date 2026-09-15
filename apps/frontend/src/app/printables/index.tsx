import { useState } from 'react';
import { Tab, TabList, Tabs } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { NfcKeychainCard } from './NfcKeychainCard';
import { SmartPlugCover } from './SmartPlugCover';
import de from './de.json';
import en from './en.json';

export default function PrintablesPage() {
  const { t } = useTranslations({ de, en });
  const [model, setModel] = useState('nfc');

  return (
    <div>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />
      <Tabs selectedKey={model} onSelectionChange={(key) => setModel(String(key))} className="mb-6">
        <Tabs.ListContainer><TabList aria-label={t('modelSelection')}><Tab id="nfc">{t('cardTitle')}</Tab><Tab id="plug">{t('plugTitle')}</Tab></TabList></Tabs.ListContainer>
      </Tabs>
      {model === 'nfc' ? <NfcKeychainCard /> : <SmartPlugCover />}
    </div>
  );
}
