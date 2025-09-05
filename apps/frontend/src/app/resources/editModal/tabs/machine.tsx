import { Switch } from '@heroui/react';
import { EditorTabProps } from './props';

export function MachineTab(props: EditorTabProps) {
  const { t, formData, setField } = props;

  return (
    <div className="flex flex-col gap-2">
      <Switch
        isSelected={formData.allowTakeOver}
        onValueChange={(value) => setField('allowTakeOver', value)}
        data-cy="resource-edit-modal-allow-takeover-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.machine.allowTakeOver.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.machine.allowTakeOver.description')}</span>
        </div>
      </Switch>
    </div>
  );
}
