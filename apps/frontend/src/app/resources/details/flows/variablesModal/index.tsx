import {
  Chip,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ResourceFlowVariableScope } from '@attraccess/react-query-client';
import { VariableEditor } from './editor';
import { StandardModal } from '../../../../../components/standardModal';
import { Props } from './index.props';
import { previewValue } from './index.helpers';
import { fullValue } from './index.helpers';
import { useVariablesModalState } from './useVariablesModalState';

export function VariablesModal(props: Props) {
  const {
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
  } = useVariablesModalState(props);

  return (
    <>
      {props.children(open)}
      <StandardModal isOpen={isOpen} onOpenChange={setOpen} size="lg">
        <ModalHeader className="flex flex-col gap-1">
          <ModalHeading>{t('title')}</ModalHeading>
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
                <div className="flex flex-row gap-2">
                  <Button
                    variant={activeScope === ResourceFlowVariableScope.RESOURCE ? 'primary' : 'ghost'}
                    onPress={() => setActiveScope(ResourceFlowVariableScope.RESOURCE)}
                  >
                    {t('tabs.resource')}
                  </Button>
                  <Button
                    variant={activeScope === ResourceFlowVariableScope.GLOBAL ? 'primary' : 'ghost'}
                    onPress={() => setActiveScope(ResourceFlowVariableScope.GLOBAL)}
                  >
                    {t('tabs.global')}
                  </Button>
                </div>
                <Button variant="primary" onPress={handleAdd}>
                  <Plus className="h-4 w-4" />
                  {t('actions.add')}
                </Button>
              </div>

              <Table aria-label={t('title')}>
                <TableScrollContainer>
                  <TableContent>
                    <TableHeader>
                      <TableColumn isRowHeader>{t('table.key')}</TableColumn>
                      <TableColumn>{t('table.type')}</TableColumn>
                      <TableColumn>{t('table.value')}</TableColumn>
                      <TableColumn>{t('table.updated')}</TableColumn>
                      <TableColumn>{t('table.actions')}</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell>{t('table.empty')}</TableCell>
                          <TableCell>{null}</TableCell>
                          <TableCell>{null}</TableCell>
                          <TableCell>{null}</TableCell>
                          <TableCell>{null}</TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow key={rowKey(row)}>
                            <TableCell className="font-mono">{row.key}</TableCell>
                            <TableCell>
                              <Chip variant="soft">{String(row.valueType)}</Chip>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="font-mono text-sm">{previewValue(row.value as unknown)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <pre className="max-w-md whitespace-pre-wrap">{fullValue(row.value as unknown)}</pre>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-sm text-default-500">{formatDateTime(row.updatedAt)}</TableCell>
                            <TableCell>
                              <div className="flex flex-row justify-end gap-1">
                                <Button
                                  isIconOnly
                                  variant="ghost"
                                  aria-label={t('actions.edit')}
                                  onPress={() => handleEdit(row)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {pendingDeleteKey === rowKey(row) ? (
                                  <>
                                    <Button variant="ghost" onPress={() => setPendingDeleteKey(null)}>
                                      {t('actions.confirmDeleteNo')}
                                    </Button>
                                    <Button
                                      variant="danger"
                                      isPending={remove.isPending}
                                      onPress={() => handleDelete(row)}
                                    >
                                      {t('actions.confirmDeleteYes')}
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    isIconOnly
                                    variant="danger-soft"
                                    aria-label={t('actions.delete')}
                                    onPress={() => setPendingDeleteKey(rowKey(row))}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onPress={close}>
            {t('actions.close')}
          </Button>
        </ModalFooter>
      </StandardModal>
    </>
  );
}
