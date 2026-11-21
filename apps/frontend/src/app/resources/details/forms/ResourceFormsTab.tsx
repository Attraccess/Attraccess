import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Chip,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { InboxIcon, PencilIcon, PlusIcon } from 'lucide-react';
import {
  AlertStatusIcon,
  Button,
  EmptyState,
  LabeledSwitch,
  TableActionsColumnHeader,
  TableRowActions,
} from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  FormResourceOverrideDto,
  FormScope,
  ResourceApplicableFormDto,
  useResourceFormsDeleteOverride,
  useResourceFormsList,
  useResourceFormsSetOverride,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { useScopeLabel } from '../../../forms/useScopeLabel';
import { useFormsTranslations } from '../../../forms/useFormsTranslations';
import { scopeChipColor } from '../../../forms/scopeChipColor';
import { invalidateFormQueries } from '../../../forms/editor/formPayloads';
import { OverrideSelect } from './OverrideSelect';
import { OVERRIDE_FLAGS, currentOverride, fromChoice, inheritsEverything } from './overrideFlags';

/** The forms that apply to this resource, its own and inherited ones, and how the resource deviates from them. */
export function ResourceFormsTab() {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const { t, tExists } = useFormsTranslations();
  const scopeLabel = useScopeLabel();
  const [savingFormIds, setSavingFormIds] = useState<ReadonlySet<number>>(new Set());

  const {
    data: forms,
    isLoading,
    isError,
  } = useResourceFormsList({ path: { resourceId } }, undefined, {
    enabled: Number.isFinite(resourceId),
  });

  const markSaving = (formId: number, saving: boolean) =>
    setSavingFormIds((current) => {
      const next = new Set(current);
      if (saving) next.add(formId);
      else next.delete(formId);
      return next;
    });
  const mutationOptions = {
    onSuccess: () => {
      toast.success({ title: t('resourceTab.saved') });
      return invalidateFormQueries(queryClient);
    },
    onError: (error: unknown) => toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' }),
    onSettled: (_data: unknown, _error: unknown, variables: { path: { formId: number } }) =>
      markSaving(variables.path.formId, false),
  };
  const setOverride = useResourceFormsSetOverride(undefined, mutationOptions);
  const deleteOverride = useResourceFormsDeleteOverride(undefined, mutationOptions);

  /** Stores the changed override; one that only inherits is removed instead. */
  const save = (item: ResourceApplicableFormDto, change: Partial<FormResourceOverrideDto>) => {
    const next = { ...currentOverride(item), ...change };
    const path = { resourceId, formId: item.form.id };
    markSaving(item.form.id, true);
    if (inheritsEverything(next)) {
      if (item.override) deleteOverride.mutate({ path });
      else markSaving(item.form.id, false);
      return;
    }
    setOverride.mutate({ path, body: next });
  };

  const sourceLabel = (item: ResourceApplicableFormDto) =>
    item.source === FormScope.RESOURCE ? t('scope.resource') : scopeLabel(item.source, null, item.groupName);

  return (
    <div className="flex flex-col gap-4" data-cy="resource-forms-tab">
      <div className="flex justify-end">
        <Button
          variant="primary"
          onPress={() => navigate(`/forms/new?scope=resource&resourceId=${resourceId}`)}
          data-cy="resource-forms-create-button"
        >
          <PlusIcon className="w-4 h-4" />
          {t('resourceTab.create')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner color="accent" />
        </div>
      ) : isError ? (
        <Alert status="danger">
          <AlertStatusIcon status="danger" />
          <AlertContent>
            <AlertDescription>{t('resourceTab.loadError')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <Table>
          <TableScrollContainer>
            <TableContent aria-label={t('resourceTab.tableLabel')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('resourceTab.columns.name')}</TableColumn>
                <TableColumn>{t('resourceTab.columns.source')}</TableColumn>
                <TableColumn>{t('resourceTab.columns.enabled')}</TableColumn>
                <TableColumn>{t('resourceTab.columns.start')}</TableColumn>
                <TableColumn>{t('resourceTab.columns.takeover')}</TableColumn>
                <TableColumn>{t('resourceTab.columns.end')}</TableColumn>
                <TableColumn>
                  <TableActionsColumnHeader />
                </TableColumn>
              </TableHeader>
              <TableBody
                items={forms ?? []}
                dependencies={[savingFormIds]}
                renderEmptyState={() => <EmptyState message={t('resourceTab.empty')} />}
              >
                {(item) => (
                  <TableRow id={item.form.id}>
                    <TableCell>
                      <span className="font-medium">{item.form.name}</span>
                    </TableCell>
                    <TableCell>
                      <Chip
                        variant="soft"
                        color={scopeChipColor(item.source)}
                        data-cy={`resource-form-source-${item.form.id}`}
                      >
                        {sourceLabel(item)}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <LabeledSwitch
                        aria-label={t('resourceTab.toggle', { name: item.form.name })}
                        isSelected={!item.disabled}
                        isDisabled={savingFormIds.has(item.form.id)}
                        onChange={(enabled) => save(item, { disabled: !enabled })}
                        data-cy={`resource-form-toggle-${item.form.id}`}
                      />
                    </TableCell>
                    {OVERRIDE_FLAGS.map(([action, flag]) => (
                      <TableCell key={action}>
                        <OverrideSelect
                          item={item}
                          action={action}
                          flag={flag}
                          isDisabled={item.disabled || savingFormIds.has(item.form.id)}
                          onChange={(choice) => save(item, { [flag]: fromChoice(choice) })}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <TableRowActions
                        itemName={item.form.name}
                        data-cy={`resource-form-actions-${item.form.id}`}
                        actions={[
                          {
                            key: 'edit',
                            label: t('resourceTab.editAction'),
                            icon: PencilIcon,
                            onPress: () => navigate(`/forms/${item.form.id}`),
                            'data-cy': `resource-form-edit-${item.form.id}`,
                          },
                          {
                            key: 'submissions',
                            label: t('resourceTab.submissionsAction'),
                            icon: InboxIcon,
                            onPress: () => navigate(`/forms/${item.form.id}?tab=submissions&resourceId=${resourceId}`),
                            'data-cy': `resource-form-submissions-${item.form.id}`,
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
    </div>
  );
}
