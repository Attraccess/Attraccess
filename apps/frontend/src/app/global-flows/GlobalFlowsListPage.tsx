import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Input,
  Label,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextArea,
  TextField,
  useOverlayState,
} from '@heroui/react';
import { PencilIcon, PlusIcon, SettingsIcon, Trash2Icon } from 'lucide-react';
import {
  AlertStatusIcon,
  Button,
  EmptyState,
  LabeledSwitch,
  PageHeader,
  StandardModal,
  StatusDialog,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useGlobalFlowsServiceCreateGlobalFlow,
  useGlobalFlowsServiceDeleteGlobalFlow,
  UseGlobalFlowsServiceGetGlobalFlowKeyFn,
  useGlobalFlowsServiceListGlobalFlows,
  useGlobalFlowsServiceListGlobalFlowsKey,
  useGlobalFlowsServiceUpdateGlobalFlow,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { useToastMessage } from '../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import de from './de.json';
import en from './en.json';

type ListedFlow = {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  nodeCount: number;
};

export function useGlobalFlowsTranslations() {
  return useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
}

export const GLOBAL_FLOW_NAME_MAX_LENGTH = 200;
export const GLOBAL_FLOW_DESCRIPTION_MAX_LENGTH = 2000;

type FlowDetails = { id: number; name: string; description: string | null };

/** Creates a global flow, or edits the name and description of the given one. */
export function GlobalFlowDetailsModal({
  isOpen,
  onOpenChange,
  flow,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  flow?: FlowDetails;
}) {
  const { t, tExists } = useGlobalFlowsTranslations();
  const navigate = useNavigate();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState(flow?.name ?? '');
  const [description, setDescription] = useState(flow?.description ?? '');

  // Every opening starts from the saved values (or empty), never from what a cancelled attempt left behind.
  useEffect(() => {
    if (isOpen) {
      setName(flow?.name ?? '');
      setDescription(flow?.description ?? '');
    }
  }, [isOpen, flow?.id, flow?.name, flow?.description]);

  const onError = (error: unknown) =>
    toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });

  const create = useGlobalFlowsServiceCreateGlobalFlow({
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: [useGlobalFlowsServiceListGlobalFlowsKey] });
      onOpenChange(false);
      navigate(`/devices/flows/${created.id}`);
    },
    onError,
  });
  const update = useGlobalFlowsServiceUpdateGlobalFlow({
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: [useGlobalFlowsServiceListGlobalFlowsKey] });
      void queryClient.invalidateQueries({ queryKey: UseGlobalFlowsServiceGetGlobalFlowKeyFn({ flowId: updated.id }) });
      onOpenChange(false);
    },
    onError,
  });

  const isPending = create.isPending || update.isPending;
  const canSubmit = name.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    const details = { name: name.trim(), description: description.trim() ? description.trim() : undefined };
    if (flow) {
      // An emptied description has to be sent as null, otherwise the old text would stay.
      update.mutate({ flowId: flow.id, requestBody: { ...details, description: details.description ?? null } });
    } else {
      create.mutate({ requestBody: details });
    }
  };

  return (
    <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} data-cy="global-flows-details-modal">
      <ModalHeader>
        <ModalHeading>{flow ? t('list.editModalTitle') : t('list.createdModalTitle')}</ModalHeading>
      </ModalHeader>
      <ModalBody className="flex flex-col gap-4">
        <TextField value={name} onChange={setName} isRequired autoFocus maxLength={GLOBAL_FLOW_NAME_MAX_LENGTH}>
          <Label>{t('list.createName')}</Label>
          <Input data-cy="global-flows-create-name" />
        </TextField>
        <TextField value={description} onChange={setDescription} maxLength={GLOBAL_FLOW_DESCRIPTION_MAX_LENGTH}>
          <Label>{t('list.createDescription')}</Label>
          <TextArea rows={3} data-cy="global-flows-create-description" />
        </TextField>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onPress={() => onOpenChange(false)} isDisabled={isPending}>
          {t('list.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={submit}
          isDisabled={!canSubmit}
          isPending={isPending}
          data-cy="global-flows-create-submit"
        >
          {flow ? t('list.editSubmit') : t('list.createSubmit')}
        </Button>
      </ModalFooter>
    </StandardModal>
  );
}

export function GlobalFlowsListPage() {
  const { hasPermission } = useAuth();
  const { t, tExists } = useGlobalFlowsTranslations();
  const navigate = useNavigate();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const createModal = useOverlayState();
  const [flowToDelete, setFlowToDelete] = useState<ListedFlow | null>(null);
  const [flowToEdit, setFlowToEdit] = useState<ListedFlow | null>(null);
  const editModal = useOverlayState();

  const { data: flows, isLoading, isError } = useGlobalFlowsServiceListGlobalFlows();

  const refresh = () => queryClient.invalidateQueries({ queryKey: [useGlobalFlowsServiceListGlobalFlowsKey] });
  const onError = (error: unknown) =>
    toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });

  const update = useGlobalFlowsServiceUpdateGlobalFlow({ onSuccess: refresh, onError });
  const remove = useGlobalFlowsServiceDeleteGlobalFlow({
    onSuccess: () => {
      void refresh();
      toast.success({ title: t('list.deleted') });
      setFlowToDelete(null);
    },
    onError,
  });

  if (!hasPermission('resources.update')) {
    return <Navigate to="/" />;
  }

  return (
    <div data-cy="global-flows-page">
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        actions={[
          {
            key: 'create-flow',
            label: t('list.create'),
            icon: <PlusIcon size={16} />,
            variant: 'primary',
            onPress: createModal.open,
            dataCy: 'global-flows-create-button',
          },
        ]}
      />

      {isLoading ? (
        <div className="flex items-center justify-center p-4">
          <Spinner color="accent" />
        </div>
      ) : isError ? (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('list.loadError')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('list.tableLabel')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('list.columns.name')}</TableColumn>
                <TableColumn>{t('list.columns.enabled')}</TableColumn>
                <TableColumn>{t('list.columns.nodes')}</TableColumn>
                <TableColumn>{t('list.columns.actions')}</TableColumn>
              </TableHeader>
              <TableBody items={flows ?? []} renderEmptyState={() => <EmptyState message={t('list.empty')} />}>
                {(flow) => (
                  <TableRow key={`global-flow-${flow.id}`} id={flow.id}>
                    <TableCell>
                      <div className="flex min-w-40 flex-col">
                        <span className="font-medium">{flow.name}</span>
                        {flow.description && <span className="text-sm text-muted">{flow.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LabeledSwitch
                        aria-label={t('list.toggle', { name: flow.name })}
                        isSelected={flow.enabled}
                        isDisabled={update.isPending}
                        onChange={(enabled) => update.mutate({ flowId: flow.id, requestBody: { enabled } })}
                        data-cy={`global-flow-toggle-${flow.id}`}
                      />
                    </TableCell>
                    <TableCell>{flow.nodeCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-row gap-2">
                        <Button
                          isIconOnly
                          variant="ghost"
                          aria-label={t('list.edit', { name: flow.name })}
                          onPress={() => navigate(`/devices/flows/${flow.id}`)}
                          data-cy={`global-flow-edit-${flow.id}`}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          isIconOnly
                          variant="ghost"
                          aria-label={t('list.editDetails', { name: flow.name })}
                          onPress={() => {
                            setFlowToEdit(flow);
                            editModal.open();
                          }}
                          data-cy={`global-flow-details-${flow.id}`}
                        >
                          <SettingsIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          isIconOnly
                          variant="danger-soft"
                          aria-label={t('list.delete', { name: flow.name })}
                          onPress={() => setFlowToDelete(flow)}
                          data-cy={`global-flow-delete-${flow.id}`}
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}

      <GlobalFlowDetailsModal isOpen={createModal.isOpen} onOpenChange={createModal.setOpen} />
      <GlobalFlowDetailsModal
        isOpen={editModal.isOpen}
        onOpenChange={editModal.setOpen}
        flow={flowToEdit ?? undefined}
      />

      <StatusDialog
        isOpen={flowToDelete !== null}
        onClose={() => setFlowToDelete(null)}
        status="error"
        title={t('list.deleteTitle')}
        closeLabel={t('list.cancel')}
        action={{
          label: t('list.deleteAction'),
          onPress: () => flowToDelete && remove.mutate({ flowId: flowToDelete.id }),
          isPending: remove.isPending,
          'data-cy': 'global-flows-delete-confirm',
        }}
        data-cy="global-flows-delete-dialog"
      >
        {t('list.deleteConfirmation', { name: flowToDelete?.name ?? '' })}
      </StatusDialog>
    </div>
  );
}
