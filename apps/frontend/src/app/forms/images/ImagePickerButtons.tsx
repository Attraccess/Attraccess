import { useRef } from 'react';
import { Button } from '@heroui/react';
import { Camera, Upload } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface ImagePickerButtonsProps {
  /** Several files at once in the upload picker. The camera takes one photo at a time. */
  multiple?: boolean;
  isDisabled?: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * Take photo (opens the camera on phones, the file picker on a desktop) and Upload. The file inputs stay hidden and
 * are opened by the buttons, so the controls look like the rest of the app.
 */
export function ImagePickerButtons({
  multiple = false,
  isDisabled = false,
  onFiles,
}: Readonly<ImagePickerButtonsProps>) {
  const { t } = useTranslations({ en, de });
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const handle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Picking the same file again must fire a change.
    event.target.value = '';
    if (files.length) onFiles(files);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" isDisabled={isDisabled} onPress={() => cameraRef.current?.click()}>
        <Camera className="w-4 h-4" />
        {t('take')}
      </Button>
      <Button variant="secondary" isDisabled={isDisabled} onPress={() => uploadRef.current?.click()}>
        <Upload className="w-4 h-4" />
        {t('upload')}
      </Button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="image-input-camera"
        onChange={handle}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        hidden
        data-testid="image-input-upload"
        onChange={handle}
      />
    </div>
  );
}
