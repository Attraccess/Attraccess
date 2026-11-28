import { useState } from 'react';
import { Tabs } from '@heroui/react';
import { PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { RfidKeychainCard } from './RfidKeychainCard';
import { SmartPlugCover } from './SmartPlugCover';
import { DEFAULT_CARD_LABEL } from './download';
import { DEFAULT_PLUG_CONFIG, type PlugConfig } from './smartPlugConfig';
import de from './de.json';
import en from './en.json';

export default function PrintablesPage() {
  const { t } = useTranslations({ de, en });
  // Only the selected panel is mounted, so a model's render worker starts when its tab opens.
  // The settings live here instead, so switching tabs and back keeps them.
  const [label, setLabel] = useState(DEFAULT_CARD_LABEL);
  const [plugConfig, setPlugConfig] = useState<PlugConfig>(DEFAULT_PLUG_CONFIG);

  return (
    <div>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />
      <Tabs defaultSelectedKey="rfid-keychain-card" className="max-w-[1050px]">
        <Tabs.ListContainer>
          <Tabs.List aria-label={t('modelSelection')}>
            <Tabs.Tab id="rfid-keychain-card" data-cy="printables-tab-rfid-keychain-card" className="whitespace-nowrap">
              {t('cardTitle')}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="smart-plug-cover" data-cy="printables-tab-smart-plug-cover" className="whitespace-nowrap">
              {t('plugTitle')}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="rfid-keychain-card" className="pt-5">
          <RfidKeychainCard label={label} onLabelChange={setLabel} />
        </Tabs.Panel>
        <Tabs.Panel id="smart-plug-cover" className="pt-5">
          <SmartPlugCover config={plugConfig} onConfigChange={setPlugConfig} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
