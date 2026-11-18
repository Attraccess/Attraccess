import { Button, ResourceSelector, StandardDrawer, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './AttractapEditor.de.json';
import en from './AttractapEditor.en.json';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  Form,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetReaderById,
  useGetReadersKey,
  useUpdateReader,
  UseGetReaderByIdKeyFn,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { ReaderSecurity } from '../pairing/ReaderSecurity';
import { ReaderUiReaderPanel } from '../../readerUi/ReaderUiReaderPanel';
import { isBleBridge } from '../bleBridge';
import { EditorTab, visibleEditorTabs } from './editorTabs';
import { GeneralSettings } from './GeneralSettings';

interface Props {
  readerId?: number;
  isOpen: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function AttractapEditor(props: Readonly<Props>) {
  const { t } = useTranslations({
    de,
    en,
  });

  const queryClient = useQueryClient();

  const { data: reader } = useGetReaderById({ path: { readerId: props.readerId as number } }, undefined, {
    enabled: props.readerId !== undefined,
  });

  const toast = useToastMessage();

  const [name, setName] = useState('');
  const [ledBrightness, setLedBrightness] = useState<number>(255);
  const [allowPluginBle, setAllowPluginBle] = useState(false);
  const [connectedResourceIds, setConnectedResourceIds] = useState<number[]>([]);
  const [selectedTab, setSelectedTab] = useState<EditorTab>('general');
  // A BLE Bridge has no NFC, display or LEDs and serves no resource: only its name, plugin Bluetooth and pairing apply.
  const bleBridge = reader !== undefined && isBleBridge(reader);
  const tabs = visibleEditorTabs(reader !== undefined, bleBridge);
  const updateReaderMutation = useUpdateReader(undefined, {
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [useGetReadersKey] });
      queryClient.invalidateQueries({
        queryKey: UseGetReaderByIdKeyFn({ path: { readerId: variables.path.readerId } }),
      });
      toast.success({
        title: t('readerUpdated'),
        description: t('readerUpdatedDescription'),
      });
      props.onSave();
    },
    onError: (error: Error) => {
      toast.error({
        title: t('errorUpdatingReader'),
        description: (error as Error).message,
      });
    },
  });

  useEffect(() => {
    setName(reader?.name ?? '');
    setLedBrightness(reader?.ledBrightness ?? 255);
    setAllowPluginBle(reader?.allowPluginBle ?? false);
    setConnectedResourceIds(reader?.resources.map((r) => r.id) ?? []);
  }, [reader]);

  const save = useCallback(async () => {
    if (props.readerId === undefined) {
      return;
    }

    // Only send the opt-in when the administrator changed it, so a save with a stale or not yet loaded value
    // can never switch plugin Bluetooth access off as a side effect (for example on a rename).
    const allowPluginBleChanged = reader !== undefined && allowPluginBle !== (reader.allowPluginBle ?? false);
    updateReaderMutation.mutate({
      path: { readerId: props.readerId },
      body: {
        name,
        // A bridge serves no resource and has no LEDs.
        ...(bleBridge ? { connectedResourceIds: [] } : { connectedResourceIds, ledBrightness }),
        ...(allowPluginBleChanged ? { allowPluginBle } : {}),
      },
    });
  }, [name, connectedResourceIds, ledBrightness, allowPluginBle, reader, bleBridge, props, updateReaderMutation]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await save();
    },
    [save],
  );

  return (
    <StandardDrawer isOpen={props.isOpen} onOpenChange={(open) => !open && props.onCancel()}>
      <div data-cy="attractap-editor-form" className="contents">
        <DrawerHeader>
          <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
        </DrawerHeader>
        <DrawerBody>
          <Form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Tabs
              selectedKey={tabs.includes(selectedTab) ? selectedTab : 'general'}
              onSelectionChange={(k) => setSelectedTab(k as EditorTab)}
              className="w-full"
              data-cy="attractap-editor-tabs"
            >
              <Tabs.ListContainer>
                <TabList>
                  <Tab id="general" data-cy="attractap-editor-general-tab">
                    <Tabs.Indicator />
                    {t('tabs.general')}
                  </Tab>
                  {tabs.includes('resources') && (
                    <Tab id="resources" data-cy="attractap-editor-resources-tab">
                      <Tabs.Indicator />
                      {t('tabs.resources')}
                    </Tab>
                  )}
                  {tabs.includes('readerUi') && (
                    <Tab id="readerUi" data-cy="attractap-editor-reader-ui-tab">
                      <Tabs.Indicator />
                      {t('tabs.readerUi')}
                    </Tab>
                  )}
                  {tabs.includes('security') && (
                    <Tab id="security" data-cy="attractap-editor-security-tab">
                      <Tabs.Indicator />
                      {t('tabs.security')}
                    </Tab>
                  )}
                </TabList>
              </Tabs.ListContainer>
              <TabPanel id="general" className="pt-4">
                <GeneralSettings
                  name={name}
                  onNameChange={setName}
                  bleBridge={bleBridge}
                  showLedBrightness={!bleBridge && reader?.firmware.capabilities.hasLeds === true}
                  ledBrightness={ledBrightness}
                  onLedBrightnessChange={setLedBrightness}
                  allowPluginBle={allowPluginBle}
                  onAllowPluginBleChange={setAllowPluginBle}
                />
              </TabPanel>
              {tabs.includes('resources') && (
                <TabPanel id="resources" className="pt-4">
                  <div className="flex flex-col gap-3 w-full">
                    <p className="text-sm text-default-500">{t('connectedResourcesDescription')}</p>
                    <ResourceSelector
                      selection={connectedResourceIds}
                      onSelectionChange={setConnectedResourceIds}
                      data-cy="attractap-editor-resource-selector"
                      multiple={reader?.firmware.capabilities.resourceSelection ?? true}
                    />
                  </div>
                </TabPanel>
              )}
              {reader && tabs.includes('readerUi') && (
                <TabPanel id="readerUi" className="pt-4">
                  <ReaderUiReaderPanel readerId={reader.id} resources={reader.resources} />
                </TabPanel>
              )}
              {reader && tabs.includes('security') && (
                <TabPanel id="security" className="pt-4">
                  <ReaderSecurity reader={reader} onPairingRemoved={props.onCancel} />
                </TabPanel>
              )}
            </Tabs>
          </Form>
        </DrawerBody>
        <DrawerFooter>
          <Button
            variant="secondary"
            onPress={() => {
              props.onCancel();
            }}
            isDisabled={updateReaderMutation.isPending}
            data-cy="attractap-editor-cancel-button"
          >
            {t('cancel')}
          </Button>
          <Button isPending={updateReaderMutation.isPending} onPress={save} data-cy="attractap-editor-save-button">
            {t('save')}
          </Button>
        </DrawerFooter>
      </div>
    </StandardDrawer>
  );
}
