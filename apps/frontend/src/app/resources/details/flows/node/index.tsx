import { Button, Card, Code, cn, Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';
import { Handle, NodeToolbar, Position } from '@xyflow/react';
import { Edit2Icon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { DeleteConfirmationModal } from '../../../../../components/deleteConfirmationModal';
import { NodeEditor } from './editor';
import { Props } from './index.props';
import { ProcessingState } from './index.processing-state';
import { useAttraccessNodeState } from './useAttraccessNodeState';

export function AttraccessNode(props: Props) {
  const {
    schema,
    previewMode,
    t,
    tNodeExists,
    data,
    validationError,
    processingState,
    remove,
    showDeleteConfirmation,
    userWantsToDelete,
    userDoesNotWantToDelete,
    cardClasses,
    targetHandlesWithStyles,
    sourceHandlesWithStyles,
    isEditable,
    previewRows,
    nodeTitle,
    nodeDescription,
  } = useAttraccessNodeState(props);

  return (
    <NodeEditor schema={schema} tNodeTranslations={t} tNodeExists={tNodeExists}>
      {(openEditor) => (
        <div>
          <DeleteConfirmationModal
            isOpen={showDeleteConfirmation}
            onClose={userDoesNotWantToDelete}
            onConfirm={remove}
            itemName={nodeTitle}
          />

          <NodeToolbar isVisible={data?.forceToolbarVisible || undefined} position={data?.toolbarPosition}>
            <div className="flex flex-row gap-2">
              {isEditable && (
                <Button isIconOnly onPress={openEditor}>
                  <Edit2Icon size={12} />
                </Button>
              )}
              {!previewMode && (
                <Button variant="danger" isIconOnly onPress={userWantsToDelete}>
                  <Trash2Icon size={12} />
                </Button>
              )}
            </div>
          </NodeToolbar>
          <div className="relative">
            <Card className={cardClasses} onDoubleClick={isEditable ? openEditor : undefined}>
              <Card.Header className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center min-w-0">
                    <span className="font-bold text-sm truncate">{nodeTitle}</span>
                  </div>
                  {!previewMode && (
                    <Tooltip>
                      <TooltipTrigger tabIndex={0}>
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            processingState === ProcessingState.PROCESSING
                              ? 'bg-accent animate-pulse'
                              : processingState === ProcessingState.COMPLETED
                                ? 'bg-green-500'
                                : processingState === ProcessingState.FAILED
                                  ? 'bg-red-500'
                                  : 'bg-muted',
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {processingState === ProcessingState.PROCESSING
                          ? 'Processing'
                          : processingState === ProcessingState.COMPLETED
                            ? 'Completed'
                            : processingState === ProcessingState.FAILED
                              ? 'Failed'
                              : 'Idle'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {(previewMode || !isEditable) && nodeDescription && (
                  <span className="text-xs text-muted text-wrap">{nodeDescription}</span>
                )}
              </Card.Header>

              {!previewMode && previewRows.length > 0 && (
                <Card.Content className="pt-0">
                  <div className="flex flex-col gap-2">
                    {previewRows.map((row) => (
                      <div className="flex flex-col gap-1" key={row.label}>
                        <small className="text-muted">{row.label}</small>
                        {'entries' in row ? (
                          row.entries.length === 0 ? (
                            <Code className="text-ellipsis overflow-hidden">-</Code>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {row.entries.map((entry, idx) => (
                                <div
                                  key={idx}
                                  className="flex flex-col gap-0.5 rounded-md border border-border px-2 py-1"
                                >
                                  {entry.fields.map((field) => (
                                    <div
                                      key={field.label}
                                      className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline min-w-0"
                                    >
                                      <small className="text-muted whitespace-nowrap">{field.label}</small>
                                      <Code
                                        className="text-ellipsis overflow-hidden whitespace-nowrap min-w-0"
                                        title={field.value}
                                      >
                                        {field.value}
                                      </Code>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )
                        ) : (
                          <Code className="text-ellipsis overflow-hidden" title={row.value}>
                            {row.value}
                          </Code>
                        )}
                      </div>
                    ))}
                  </div>
                </Card.Content>
              )}
            </Card>

            {!previewMode &&
              targetHandlesWithStyles.map(({ id: handleId, label, style }) => (
                <div key={handleId} className="absolute z-10" style={style}>
                  <Tooltip isDisabled={!label}>
                    <TooltipTrigger tabIndex={0}>
                      <Handle
                        type="target"
                        position={Position.Top}
                        className="!w-4 !h-4"
                        style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}
                        id={handleId}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                </div>
              ))}

            {!previewMode &&
              sourceHandlesWithStyles.map(({ id: handleId, label, style }) => (
                <div key={handleId} className="absolute z-10" style={style}>
                  <Tooltip isDisabled={!label}>
                    <TooltipTrigger tabIndex={0}>
                      <Handle
                        type="source"
                        position={Position.Bottom}
                        className="!w-4 !h-4"
                        style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}
                        id={handleId}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
          </div>

          {!previewMode && !schema.supportedByResource && (
            <div className="text-xs text-warning mt-1 px-1 flex flex-row items-center gap-1">
              <TriangleAlertIcon size={12} /> {t('nodes.unsupportedForResourceType')}
            </div>
          )}
          {!previewMode && validationError && (
            <div className="text-xs text-danger mt-1 px-1 flex flex-row items-center gap-1">
              <TriangleAlertIcon size={12} /> {validationError}
            </div>
          )}
        </div>
      )}
    </NodeEditor>
  );
}
