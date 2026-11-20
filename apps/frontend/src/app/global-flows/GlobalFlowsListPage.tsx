import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  useOverlayState,
} from '@heroui/react';
import { PencilIcon, PlusIcon, Trash2Icon, WorkflowIcon } from 'lucide-react';
import {
  AlertStatusIcon,
  EmptyState,
  LabeledSwitch,
  PageHeader,
  TableActionsColumnHeader,
  TableRowActions,
} from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useDeleteGlobalFlow,
  useListGlobalFlows,
  useListGlobalFlowsKey,
  useUpdateGlobalFlow,
} from '@attraccess/react-query-client';
import { useAuth } from '../../hooks/useAuth';
import { useToastMessage } from '../../components/toastProvider';
import { GlobalFlowDetailsModal } from './GlobalFlowDetailsModal';
import { useGlobalFlowsTranslations } from './useGlobalFlowsTranslations';

type ListedFlow = {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  nodeCount: number;
};

export function GlobalFlowsListPage() {
  const { hasPermission } = useAuth();
  const { t, tExists } = useGlobalFlowsTranslations();
  const navigate = useNavigate();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const createModal = useOverlayState();
  const [flowToEdit, setFlowToEdit] = useState<ListedFlow | null>(null);
  const editModal = useOverlayState();

  const { data: flows, isLoading, isError } = useListGlobalFlows();

  const refresh = () => queryClient.invalidateQueries({ queryKey: [useListGlobalFlowsKey] });
  const onError = (error: unknown) =>
    toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });

  // Only the row being saved is locked, the other switches stay usable.
  const [savingFlowIds, setSavingFlowIds] = useState<ReadonlySet<number>>(new Set());
  const markSaving = (flowId: number, saving: boolean) =>
    setSavingFlowIds((current) => {
      const next = new Set(current);
      if (saving) next.add(flowId);
      else next.delete(flowId);
      return next;
    });
  const update = useUpdateGlobalFlow(undefined, {
    onSuccess: refresh,
    onError,
    onSettled: (_data, _error, variables) => markSaving(variables.path.flowId, false),
  });
  const setEnabled = (flowId: number, enabled: boolean) => {
    markSaving(flowId, true);
    update.mutate({ path: { flowId }, body: { enabled } });
  };
  const remove = useDeleteGlobalFlow(undefined, {
    onSuccess: () => {
      void refresh();
      toast.success({ title: t('list.deleted') });
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
                <TableColumn>
                  <TableActionsColumnHeader />
                </TableColumn>
              </TableHeader>
              <TableBody
                items={flows ?? []}
                dependencies={[savingFlowIds]}
                renderEmptyState={() => <EmptyState message={t('list.empty')} />}
              >
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
                        isDisabled={savingFlowIds.has(flow.id)}
                        onChange={(enabled) => setEnabled(flow.id, enabled)}
                        data-cy={`global-flow-toggle-${flow.id}`}
                      />
                    </TableCell>
                    <TableCell>{flow.nodeCount}</TableCell>
                    <TableCell>
                      <TableRowActions
                        itemName={flow.name}
                        actions={[
                          {
                            key: 'open',
                            label: t('list.editTooltip'),
                            icon: WorkflowIcon,
                            onPress: () => navigate(`/devices/flows/${flow.id}`),
                            'data-cy': `global-flow-edit-${flow.id}`,
                          },
                          {
                            key: 'details',
                            label: t('list.editDetailsTooltip'),
                            icon: PencilIcon,
                            onPress: () => {
                              setFlowToEdit(flow);
                              editModal.open();
                            },
                            'data-cy': `global-flow-details-${flow.id}`,
                          },
                          {
                            key: 'delete',
                            label: t('list.deleteTooltip'),
                            icon: Trash2Icon,
                            tone: 'danger',
                            onPress: () => remove.mutateAsync({ path: { flowId: flow.id } }),
                            confirm: {
                              title: t('list.deleteTitle'),
                              message: t('list.deleteConfirmation', { name: flow.name }),
                              confirmLabel: t('list.deleteAction'),
                              cancelLabel: t('list.cancel'),
                              'data-cy': 'global-flows-delete-dialog',
                              confirmDataCy: 'global-flows-delete-confirm',
                            },
                            'data-cy': `global-flow-delete-${flow.id}`,
                          },
                        ]}
                      />
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
    </div>
  );
}
