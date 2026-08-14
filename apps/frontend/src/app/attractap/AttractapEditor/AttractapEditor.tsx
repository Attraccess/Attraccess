import { useTranslations, ResourceSelector } from '@attraccess/plugins-frontend-ui';
import de from './AttractapEditor.de.json';
import en from './AttractapEditor.en.json';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  Slider,
  SliderTrack,
  SliderFill,
  SliderThumb,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { TextField, Label, Input } from '@heroui/react';
import { StandardDrawer } from '../../../components/standardDrawer';
import { useCallback, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAttractapServiceGetReaderById,
  useAttractapServiceGetReadersKey,
  useAttractapServiceUpdateReader,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';

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

  const { data: reader } = useAttractapServiceGetReaderById({ readerId: props.readerId as number }, undefined, {
    enabled: props.readerId !== undefined,
  });

  const toast = useToastMessage();

  const [name, setName] = useState('');
  const [ledBrightness, setLedBrightness] = useState<number>(255);
  const [connectedResourceIds, setConnectedResourceIds] = useState<number[]>([]);
  const [selectedTab, setSelectedTab] = useState<'general' | 'resources'>('general');
  const updateReaderMutation = useAttractapServiceUpdateReader({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useAttractapServiceGetReadersKey] });
      toast.success({
        title: t('readerUpdated'),
        description: t('readerUpdatedDescription'),
      });
      props.onSave();
    },
    onError: (error: Error) => {
      console.error('Failed to update reader:', error);
      toast.error({
        title: t('errorUpdatingReader'),
        description: (error as Error).message,
      });
    },
  });

  useEffect(() => {
    setName(reader?.name ?? '');
    setLedBrightness(reader?.ledBrightness ?? 255);
    setConnectedResourceIds(reader?.resources.map((r) => r.id) ?? []);
  }, [reader]);

  const save = useCallback(async () => {
    if (props.readerId === undefined) {
      return;
    }

    updateReaderMutation.mutate({
      readerId: props.readerId,
      requestBody: {
        name,
        connectedResourceIds,
        ledBrightness,
      },
    });
  }, [name, connectedResourceIds, ledBrightness, props, updateReaderMutation]);

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
          <h2 className="text-lg font-semibold">{t('title')}</h2>
        </DrawerHeader>
        <DrawerBody>
          <Form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(k) => setSelectedTab(k as 'general' | 'resources')}
              className="w-full"
              data-cy="attractap-editor-tabs"
            >
              <Tabs.ListContainer>
                <TabList>
                  <Tab id="general" data-cy="attractap-editor-general-tab">
                    <Tabs.Indicator />
                    {t('tabs.general')}
                  </Tab>
                  <Tab id="resources" data-cy="attractap-editor-resources-tab">
                    <Tabs.Indicator />
                    {t('tabs.resources')}
                  </Tab>
                </TabList>
              </Tabs.ListContainer>
              <TabPanel id="general" className="pt-4">
                <div className="flex flex-col gap-4">
                  <TextField value={name} onChange={setName} className="w-full">
                    <Label>{t('readerName')}</Label>
                    <Input placeholder={t('enterReaderName')} data-cy="attractap-editor-name-input" />
                  </TextField>
                  {reader?.firmware.capabilities.hasLeds && (
                    <Slider
                      step={1}
                      minValue={0}
                      maxValue={255}
                      value={ledBrightness}
                      onChange={(val) => setLedBrightness(val as number)}
                      className="w-full"
                      data-cy="attractap-editor-led-brightness-slider"
                    >
                      <Label>{t('ledBrightness')}</Label>
                      <SliderTrack>
                        <SliderFill />
                        <SliderThumb />
                      </SliderTrack>
                    </Slider>
                  )}
                </div>
              </TabPanel>
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
          <Button
            isPending={updateReaderMutation.isPending}
            onPress={save}
            data-cy="attractap-editor-save-button"
          >
            {t('save')}
          </Button>
        </DrawerFooter>
      </div>
    </StandardDrawer>
  );
}
