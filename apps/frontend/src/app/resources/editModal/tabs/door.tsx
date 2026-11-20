import { LabeledSwitch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { EditorTabProps } from './props';
import en from '../resourceEditModal.en.json';
import de from '../resourceEditModal.de.json';

export function DoorTab(props: EditorTabProps) {
  const { formData, setField } = props;
  const { t } = useTranslations({ en, de });
  // An access-only door has a single action (Open), so it cannot also unlatch separately.
  const accessOnly = Boolean(formData.accessOnly);
  const separateUnlockAndUnlatch = Boolean(formData.separateUnlockAndUnlatch);
  return (
    <div className="flex flex-col gap-2">
      <LabeledSwitch
        isSelected={separateUnlockAndUnlatch}
        isDisabled={accessOnly}
        onChange={(value) => setField('separateUnlockAndUnlatch', value)}
        data-cy="resource-edit-modal-separate-unlock-and-unlatch-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.door.separateUnlockAndUnlatch.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.door.separateUnlockAndUnlatch.description')}</span>
        </div>
      </LabeledSwitch>
      <LabeledSwitch
        isSelected={accessOnly}
        isDisabled={separateUnlockAndUnlatch}
        onChange={(value) => setField('accessOnly', value)}
        data-cy="resource-edit-modal-access-only-switch"
      >
        <div className="flex flex-col">
          <span className="text-small">{t('inputs.door.accessOnly.label')}</span>
          <span className="text-tiny text-default-400">{t('inputs.door.accessOnly.description')}</span>
        </div>
      </LabeledSwitch>
    </div>
  );
}
