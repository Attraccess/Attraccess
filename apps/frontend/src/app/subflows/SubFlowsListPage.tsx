import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/pageHeader';
import { EmptyState } from '../../components/emptyState';
import { useToastMessage } from '../../components/toastProvider';
import { createSubFlow, subFlowsQueryKey, useSubFlows } from './api';
import en from './en.json';
import de from './de.json';

export function SubFlowsListPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastMessage();

  const { data: subFlows, isLoading, isFetched } = useSubFlows();

  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate || isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const created = await createSubFlow({
        name: name.trim(),
        description: description.trim().length > 0 ? description.trim() : null,
        nodes: [],
        edges: [],
      });
      queryClient.invalidateQueries({ queryKey: subFlowsQueryKey });
      setName('');
      setDescription('');
      onClose();
      navigate(`/flows/subflows/${created.id}`);
    } catch (error) {
      toast.error({
        title: t('list.createError'),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        actions={
          <Button color="primary" onPress={onOpen}>
            {t('list.create')}
          </Button>
        }
      />

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && (!subFlows || subFlows.length === 0) && isFetched && (
        <EmptyState message={`${t('list.emptyTitle')} · ${t('list.emptyDescription')}`} />
      )}

      {subFlows && subFlows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subFlows.map((subFlow) => (
            <Card
              key={subFlow.id}
              isPressable
              onPress={() => navigate(`/flows/subflows/${subFlow.id}`)}
              className="border border-default-200 dark:border-default-100"
            >
              <CardHeader className="flex flex-col items-start gap-2">
                <p className="text-base font-semibold text-default-700">{subFlow.name}</p>
                {subFlow.description && <p className="text-sm text-default-500">{subFlow.description}</p>}
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-1 text-sm text-default-500">
                  <span>{t('list.inputs', { count: subFlow.inputs.length })}</span>
                  <span>{t('list.outputs', { count: subFlow.outputs.length })}</span>
                </div>
              </CardBody>
              <CardFooter className="flex justify-between text-xs text-default-400">
                <span>{t('list.updated')}</span>
                <DateTimeDisplay date={subFlow.updatedAt} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior="inside">
        <ModalContent>
          {(modalClose) => (
            <>
              <ModalHeader>{t('create.title')}</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <Input
                  label={t('create.name')}
                  isRequired
                  value={name}
                  onValueChange={setName}
                  isDisabled={isCreating}
                />
                <Textarea
                  label={t('create.description')}
                  value={description}
                  onValueChange={setDescription}
                  isDisabled={isCreating}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={modalClose}>
                  {t('create.cancel')}
                </Button>
                <Button color="primary" onPress={handleCreate} isDisabled={!canCreate} isLoading={isCreating}>
                  {t('create.confirm')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
