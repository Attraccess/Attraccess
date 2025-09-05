import { Input } from '@heroui/react';
import { EditorTabProps } from './props';
import { ImageUpload } from '../../../../components/imageUpload';
import { filenameToUrl } from '../../../../api';

interface Props {
  onImageSelected: (file: File | null) => void;
}

export function SharedDataTab(props: EditorTabProps & Props) {
  const { t, formData, setField, onImageSelected, resource } = props;
  return (
    <div className="flex flex-col gap-2">
      <Input
        isRequired
        label={t('inputs.name.label')}
        value={formData.name}
        onChange={(e) => setField('name', e.target.value)}
        isInvalid={!formData.name}
        required
        data-cy="resource-edit-modal-name-input"
      />
      <Input
        label={t('inputs.description.label')}
        value={formData.description}
        onChange={(e) => setField('description', e.target.value)}
        data-cy="resource-edit-modal-description-input"
      />

      <ImageUpload
        label={t('inputs.image.label')}
        id="image"
        onChange={onImageSelected}
        className="w-full"
        currentImageUrl={resource?.imageFilename ? filenameToUrl(resource?.imageFilename) : undefined}
      />

      <button hidden type="submit" />
    </div>
  );
}
