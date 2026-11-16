import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { EditorTabProps } from './props';
import en from '../resourceEditModal.en.json';
import de from '../resourceEditModal.de.json';

export function DoorTab(props: EditorTabProps) {
  const { formData, setField } = props;
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-col gap-2">
      <LabeledSwitch
        isSelected={formData.separateUnlockAndUnlatch}
        onChange={(value) => setField('separateUnlockAndUnlatch', value)}
        data-cy="resource-edit-modal-separate-unlock-and-unlatch-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.door.separateUnlockAndUnlatch.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.door.separateUnlockAndUnlatch.description')}</span>
        </div>
      </LabeledSwitch>
    </div>
  );
}
