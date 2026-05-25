import { TextField, Label, Input, FieldError } from '@heroui/react';
import { EditorTabProps } from './props';
import { ImageUpload } from '../../../../components/imageUpload';
import { filenameToUrl } from '../../../../api';

interface Props {
  onImageSelected: (file: File | null) => void;
}

export function SharedDataTab(props: EditorTabProps & Props) {
  const { t, formData, setField, onImageSelected, resource } = props;
  return (
    <div className="flex flex-col gap-3 w-full">
      <TextField
        isRequired
        isInvalid={!formData.name}
        value={formData.name}
        onChange={(v) => setField('name', v)}
        data-cy="resource-edit-modal-name-input"
        className="w-full"
      >
        <Label>{t('inputs.name.label')}</Label>
        <Input required className="w-full" />
        {!formData.name && <FieldError>{t('inputs.name.required')}</FieldError>}
      </TextField>
      <TextField
        value={formData.description}
        onChange={(v) => setField('description', v)}
        data-cy="resource-edit-modal-description-input"
        className="w-full"
      >
        <Label>{t('inputs.description.label')}</Label>
        <Input className="w-full" />
      </TextField>

      <ImageUpload
        label={t('inputs.image.label')}
        id="image"
        onChange={onImageSelected}
        className="w-full"
        autoScale={{ maxWidth: 800, maxHeight: 800, output: 'auto' }}
        currentImageUrl={resource?.imageFilename ? filenameToUrl(resource?.imageFilename) : undefined}
      />

      <button hidden type="submit" />
    </div>
  );
}
