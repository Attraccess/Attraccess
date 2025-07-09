import { useTranslations, ResourceSelector } from '@attraccess/plugins-frontend-ui';
import de from './AttractapEditor.de.json';
import en from './AttractapEditor.en.json';
import { Button, Form, ModalBody, Modal, ModalContent, ModalHeader, ModalFooter } from '@heroui/react';
import { Input } from '@heroui/input';
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
  const { t } = useTranslations('attractap-editor', {
    de,
    en,
  });

  const queryClient = useQueryClient();

  const { data: reader } = useAttractapServiceGetReaderById({ readerId: props.readerId as number }, undefined, {
    enabled: props.readerId !== undefined,
  });

  const toast = useToastMessage();

  const [name, setName] = useState('');
  const [connectedResources, setConnectedResources] = useState<number[]>([]);
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
    setConnectedResources(reader?.hasAccessToResourceIds ?? []);
  }, [reader]);

  const save = useCallback(async () => {
    if (props.readerId === undefined) {
      return;
    }

    updateReaderMutation.mutate({
      readerId: props.readerId,
      requestBody: {
        name,
        connectedResources,
      },
    });
  }, [name, connectedResources, props, updateReaderMutation]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await save();
    },
    [save]
  );

  return (
    <Form onSubmit={onSubmit} data-cy="attractap-editor-form">
      <Modal
        isOpen={props.isOpen}
        placement="top-center"
        onOpenChange={props.onCancel}
        scrollBehavior="inside"
        data-cy="attractap-editor-modal"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">{t('title')}</ModalHeader>
              <ModalBody>
                <Input
                  label={t('readerName')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('enterReaderName')}
                  className="w-full"
                  data-cy="attractap-editor-name-input"
                />
                <ResourceSelector
                  selection={connectedResources}
                  onSelectionChange={(selection) => setConnectedResources(selection)}
                  data-cy="attractap-editor-resource-selector"
                />
              </ModalBody>
              <ModalFooter>
                <Button
                  type="button"
                  color="secondary"
                  onPress={() => {
                    props.onCancel();
                  }}
                  disabled={updateReaderMutation.isPending}
                  data-cy="attractap-editor-cancel-button"
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  isLoading={updateReaderMutation.isPending}
                  onPress={save}
                  data-cy="attractap-editor-save-button"
                >
                  {t('save')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Form>
  );
}
