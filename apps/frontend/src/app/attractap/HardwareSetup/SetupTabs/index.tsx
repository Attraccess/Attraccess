import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Tab, TabList, TabPanel, Tabs } from '@heroui/react';
import { AttractapFirmware } from '@attraccess/react-query-client';
import { ArrowLeft } from 'lucide-react';
import { Key, useEffect, useRef, useState } from 'react';
import { Button } from '../../../../components/button';
import { FirmwareFlasher } from '../FirmwareFlasher';
import { FirmwareSelector } from '../FirmwareSelector';
import { AttractapSerialConfiguratorApi } from '../SerialConfigurator/Api';
import {
  AttractapSerialCommGate,
  AttractapSerialCommProvider,
  useAttractapSerialComm,
} from '../SerialConfigurator/Auth';
import { AttractapSerialConfiguratorNetwork } from '../SerialConfigurator/Network';
import { AttractapSerialConfiguratorPin } from '../SerialConfigurator/Pin';

import de from '../de.json';
import en from '../en.json';

type TabKey = 'firmware' | 'network' | 'server' | 'security';

function FirmwareTab({ onFlashed }: { onFlashed: () => void }) {
  const { t } = useTranslations({ de, en });
  const { refreshPinStatus } = useAttractapSerialComm();
  const [selectedFirmware, setSelectedFirmware] = useState<AttractapFirmware | null>(null);

  if (!selectedFirmware) {
    return <FirmwareSelector onSelect={setSelectedFirmware} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" onPress={() => setSelectedFirmware(null)} className="self-start">
        <ArrowLeft className="w-4 h-4" />
        {t('firmware.back')}
      </Button>
      <FirmwareFlasher
        firmware={selectedFirmware}
        onCompleted={() => {
          refreshPinStatus().catch((err) => console.error('Failed to refresh PIN status after flash', err));
          onFlashed();
        }}
      />
    </div>
  );
}

// Fetches the device configuration once the session becomes authenticated.
function AutoFetchConfiguration() {
  const { isAuthenticated, fetchConfiguration } = useAttractapSerialComm();
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      hasFetched.current = false;
      return;
    }
    if (hasFetched.current) {
      return;
    }
    hasFetched.current = true;
    fetchConfiguration().catch((err) => console.error('Initial configuration fetch failed', err));
  }, [isAuthenticated, fetchConfiguration]);

  return null;
}

interface Props {
  openDeviceSettings: (deviceId: string) => void;
  onClose: () => void;
}

export function SetupTabs({ openDeviceSettings }: Props) {
  const { t } = useTranslations({ de, en });
  const [selectedTab, setSelectedTab] = useState<TabKey>('firmware');

  return (
    <AttractapSerialCommProvider>
      <AutoFetchConfiguration />

      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key: Key) => setSelectedTab(key as TabKey)}
        className="w-full"
        data-cy="attractap-setup-tabs"
      >
        <TabList>
          <Tab id="firmware" data-cy="attractap-setup-firmware-tab">
            {t('tabs.firmware')}
          </Tab>
          <Tab id="network" data-cy="attractap-setup-network-tab">
            {t('tabs.network')}
          </Tab>
          <Tab id="server" data-cy="attractap-setup-server-tab">
            {t('tabs.server')}
          </Tab>
          <Tab id="security" data-cy="attractap-setup-security-tab">
            {t('tabs.security')}
          </Tab>
        </TabList>

        <TabPanel id="firmware" className="pt-4">
          <FirmwareTab onFlashed={() => setSelectedTab('network')} />
        </TabPanel>

        <TabPanel id="network" className="pt-4">
          <AttractapSerialCommGate>
            <AttractapSerialConfiguratorNetwork />
          </AttractapSerialCommGate>
        </TabPanel>

        <TabPanel id="server" className="pt-4">
          <AttractapSerialCommGate>
            <AttractapSerialConfiguratorApi openDeviceSettings={openDeviceSettings} />
          </AttractapSerialCommGate>
        </TabPanel>

        <TabPanel id="security" className="pt-4">
          <AttractapSerialCommGate>
            <AttractapSerialConfiguratorPin />
          </AttractapSerialCommGate>
        </TabPanel>
      </Tabs>
    </AttractapSerialCommProvider>
  );
}
