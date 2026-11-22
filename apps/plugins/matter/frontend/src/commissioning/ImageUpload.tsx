import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
import { useRef, useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { ImageTooLargeError } from './imageLimits';
import { loadImagePixels } from './loadImagePixels';
import { decodeQrFromPixels } from './qrDecode';

/**
 * Picks a picture of the QR code and decodes it in the browser. The picture is never uploaded or kept. A picture that is
 * too large to read safely is refused before it is decoded.
 */
export function ImageUpload({ onScan }: Readonly<{ onScan: (text: string) => void }>) {
  const { t } = useMatterTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState<'unreadable' | 'tooLarge' | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setFailed(null);
    try {
      const text = await decodeQrFromPixels(await loadImagePixels(file));
      if (text) onScan(text);
      else setFailed('unreadable');
    } catch (error) {
      setFailed(error instanceof ImageTooLargeError ? 'tooLarge' : 'unreadable');
    }
  };

  return (
    <div className="mt:flex mt:flex-col mt:gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label={t('commissioning.image.label')}
        onChange={(event) => {
          void read(event.target.files?.[0]);
          event.target.value = '';
        }}
        data-cy="matter-image-input"
      />
      <div>
        <Button variant="secondary" onPress={() => input.current?.click()} data-cy="matter-image-pick">
          {t('commissioning.image.pick')}
        </Button>
      </div>
      <p className="mt:text-sm mt:text-muted">{t('commissioning.image.hint')}</p>
      {failed === 'unreadable' && (
        <StatusAlert status="warning" title={t('commissioning.image.failed')} data-cy="matter-image-failed">
          {t('commissioning.image.failedText')}
        </StatusAlert>
      )}
      {failed === 'tooLarge' && (
        <StatusAlert status="warning" title={t('commissioning.image.tooLarge')} data-cy="matter-image-too-large">
          {t('commissioning.image.tooLargeText')}
        </StatusAlert>
      )}
    </div>
  );
}
