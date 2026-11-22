import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
import { useRef, useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { loadImagePixels } from './loadImagePixels';
import { decodeQrFromPixels } from './qrDecode';

/** Picks a picture of the QR code and decodes it in the browser. The picture is never uploaded or kept. */
export function ImageUpload({ onScan }: Readonly<{ onScan: (text: string) => void }>) {
  const { t } = useMatterTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setFailed(false);
    try {
      const text = decodeQrFromPixels(await loadImagePixels(file));
      if (text) onScan(text);
      else setFailed(true);
    } catch {
      setFailed(true);
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
      {failed && (
        <StatusAlert status="warning" title={t('commissioning.image.failed')} data-cy="matter-image-failed">
          {t('commissioning.image.failedText')}
        </StatusAlert>
      )}
    </div>
  );
}
