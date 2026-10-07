import { useOverlayState } from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  FlowVariableDto,
  ResourceFlowVariableScope,
  UseFlowVariablesServiceListFlowVariablesKeyFn,
  useFlowVariablesServiceDeleteFlowVariable,
  useFlowVariablesServiceListFlowVariables,
  useFlowVariablesServiceUpsertFlowVariable,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import { EditorMode, VariableFormValues, ValueType } from './editor';
import de from './de.json';
import en from './en.json';
import { Props } from './index.props';

export function useVariablesModalState(props: Props) {
  const { resourceId } = props;
  const { isOpen, open, setOpen, close } = useOverlayState();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const formatDateTime = useDateTimeFormatter({ showSeconds: false });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [activeScope, setActiveScope] = useState<ResourceFlowVariableScope>(ResourceFlowVariableScope.RESOURCE);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    { open: false } | { open: true; mode: EditorMode; initial?: VariableFormValues }
  >({ open: false });

  const { data: variables } = useFlowVariablesServiceListFlowVariables({ resourceId }, undefined, {
    enabled: isOpen,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: UseFlowVariablesServiceListFlowVariablesKeyFn({ resourceId }),
    });
  }, [queryClient, resourceId]);

  const upsert = useFlowVariablesServiceUpsertFlowVariable({
    onSuccess: () => {
      invalidate();
      toast.success({ title: t('toast.saved.title') });
      setEditor({ open: false });
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const remove = useFlowVariablesServiceDeleteFlowVariable({
    onSuccess: () => {
      invalidate();
      toast.success({ title: t('toast.deleted.title') });
      setPendingDeleteKey(null);
    },
    onError: (error) => {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const rows = useMemo<FlowVariableDto[]>(() => {
    const all = (variables ?? []) as FlowVariableDto[];
    return all.filter((row) => row.scope === activeScope);
  }, [variables, activeScope]);

  const handleAdd = useCallback(() => {
    setEditor({
      open: true,
      mode: { mode: 'create' },
      initial: {
        scope: activeScope,
        key: '',
        valueType: 'string',
        value: '',
      },
    });
  }, [activeScope]);

  const handleEdit = useCallback((row: FlowVariableDto) => {
    setEditor({
      open: true,
      mode: { mode: 'edit', key: row.key, scope: row.scope },
      initial: {
        scope: row.scope,
        key: row.key,
        valueType: row.valueType as unknown as ValueType,
        value: row.value as unknown,
      },
    });
  }, []);

  const handleSubmit = useCallback(
    (values: VariableFormValues) => {
      upsert.mutate({
        resourceId,
        scope: values.scope,
        key: values.key,
        requestBody: { value: values.value as never },
      });
    },
    [upsert, resourceId],
  );

  const handleDelete = useCallback(
    (row: FlowVariableDto) => {
      remove.mutate({ resourceId, scope: row.scope, key: row.key });
    },
    [remove, resourceId],
  );

  const rowKey = (row: FlowVariableDto) => `${row.scope}:${row.key}`;
  return {
    isOpen,
    open,
    setOpen,
    close,
    t,
    formatDateTime,
    activeScope,
    setActiveScope,
    pendingDeleteKey,
    setPendingDeleteKey,
    editor,
    setEditor,
    upsert,
    remove,
    rows,
    handleAdd,
    handleEdit,
    handleSubmit,
    handleDelete,
    rowKey,
    props,
  } as const;
}
