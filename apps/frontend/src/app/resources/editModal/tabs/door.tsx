import { Switch } from '@heroui/react';
import { EditorTabProps } from './props';

export function DoorTab(props: EditorTabProps) {
  const { t, formData, setField } = props;
  return (
    <div className="flex flex-col gap-2">
      <Switch
        isSelected={formData.separateUnlockAndUnlatch}
        onValueChange={(value) => setField('separateUnlockAndUnlatch', value)}
        data-cy="resource-edit-modal-separate-unlock-and-unlatch-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.door.separateUnlockAndUnlatch.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.door.separateUnlockAndUnlatch.description')}</span>
        </div>
      </Switch>
    </div>
  );
}
