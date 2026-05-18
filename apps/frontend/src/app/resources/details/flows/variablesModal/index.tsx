import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tab,
  Tabs,
  Tooltip,
  useDisclosure,
} from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { EditorMode, VariableEditor, VariableFormValues, ValueType } from './editor';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  children: (open: () => void) => React.ReactNode;
}

function previewValue(value: unknown): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s == null) return '';
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

function fullValue(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function VariablesModal(props: Props) {
  const { resourceId } = props;
  const { isOpen, onOpenChange, onOpen, onClose } = useDisclosure();
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const formatDateTime = useDateTimeFormatter({ showSeconds: false });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const [activeScope, setActiveScope] = useState<ResourceFlowVariableScope>(ResourceFlowVariableScope.RESOURCE);
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

  return (
    <>
      {props.children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>{t('title')}</span>
            <span className="text-sm font-normal text-default-500">{t('subtitle')}</span>
          </ModalHeader>
          <ModalBody>
            {editor.open ? (
              <VariableEditor
                mode={editor.mode}
                initial={editor.initial}
                isSaving={upsert.isPending}
                onCancel={() => setEditor({ open: false })}
                onSubmit={handleSubmit}
                t={t}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
                  <Tabs
                    selectedKey={activeScope}
                    onSelectionChange={(key) => setActiveScope(key as ResourceFlowVariableScope)}
                    aria-label={t('title')}
                  >
                    <Tab key={ResourceFlowVariableScope.RESOURCE} title={t('tabs.resource')} />
                    <Tab key={ResourceFlowVariableScope.GLOBAL} title={t('tabs.global')} />
                  </Tabs>
                  <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={handleAdd}>
                    {t('actions.add')}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                <Table aria-label={t('title')} removeWrapper isStriped>
                  <TableHeader>
                    <TableColumn>{t('table.key')}</TableColumn>
                    <TableColumn>{t('table.type')}</TableColumn>
                    <TableColumn>{t('table.value')}</TableColumn>
                    <TableColumn>{t('table.updated')}</TableColumn>
                    <TableColumn align="end">{t('table.actions')}</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent={t('table.empty')} items={rows}>
                    {(row) => (
                      <TableRow key={`${row.scope}:${row.key}`}>
                        <TableCell className="font-mono">{row.key}</TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat">
                            {String(row.valueType)}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <Tooltip
                            content={
                              <pre className="max-w-md whitespace-pre-wrap">{fullValue(row.value as unknown)}</pre>
                            }
                          >
                            <span className="font-mono text-sm">{previewValue(row.value as unknown)}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-sm text-default-500">{formatDateTime(row.updatedAt)}</TableCell>
                        <TableCell>
                          <div className="flex flex-row justify-end gap-1">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              aria-label={t('actions.edit')}
                              onPress={() => handleEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Popover placement="left">
                              <PopoverTrigger>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  color="danger"
                                  aria-label={t('actions.delete')}
                                  isLoading={remove.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <div className="flex flex-col gap-2 p-2">
                                  <p className="text-sm">{t('actions.confirmDelete')}</p>
                                  <div className="flex flex-row justify-end gap-2">
                                    <Button size="sm" variant="flat">
                                      {t('actions.confirmDeleteNo')}
                                    </Button>
                                    <Button size="sm" color="danger" onPress={() => handleDelete(row)}>
                                      {t('actions.confirmDeleteYes')}
                                    </Button>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              {t('actions.close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
