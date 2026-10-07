import { Button } from '@heroui/react';
import { Edit2Icon } from 'lucide-react';
import { ResourceBillingInfoEditor } from './editor';
import type { useResourceBillingInfoState } from './useResourceBillingInfoState';
export function BillingEditorAction({ model }: { model: ReturnType<typeof useResourceBillingInfoState> }) {
  const editorAction = (
    <ResourceBillingInfoEditor resourceId={model.resourceId}>
      {(onOpen) => (
        <Button variant="primary" isIconOnly onPress={onOpen} aria-label={model.t('actions.edit')}>
          <Edit2Icon size={12} />
        </Button>
      )}
    </ResourceBillingInfoEditor>
  );

  return editorAction;
}
