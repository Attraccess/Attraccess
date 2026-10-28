import { Button, useOverlayState } from '@heroui/react';
import { HeartHandshakeIcon } from 'lucide-react';
import { I18nTransComponent, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export const COMMUNITY_LICENSE_KEY =
  'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

export const LICENSE_URL = 'https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

export interface CommunityLicenseButtonProps {
  onAccept: (licenseKey: string) => void;
  isDisabled?: boolean;
  'data-cy'?: string;
}

export function CommunityLicenseButton({ onAccept, isDisabled, ...rest }: CommunityLicenseButtonProps) {
  const { t } = useTranslations({ en, de });
  const { isOpen, open, close } = useOverlayState();

  const handleConfirm = () => {
    onAccept(COMMUNITY_LICENSE_KEY);
    close();
  };

  return (
    <>
      <Button
        variant="secondary"
        onPress={open}
        isDisabled={isDisabled}
        data-cy={rest['data-cy'] ?? 'community-license-button'}
      >
        <HeartHandshakeIcon size={16} />
        {t('button')}
      </Button>
      <StatusDialog
        isOpen={isOpen}
        onClose={close}
        status="warning"
        title={t('modal.title')}
        closeLabel={t('modal.cancel')}
        closeDataCy="community-license-cancel"
        action={{ label: t('modal.confirm'), onPress: handleConfirm, 'data-cy': 'community-license-confirm' }}
      >
        <div className="flex flex-col gap-3">
          <p>
            <I18nTransComponent
              t={t}
              i18nKey="modal.question"
              components={{
                link: (
                  <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    LICENSE.md
                  </a>
                ),
              }}
            />
          </p>
          <p>{t('modal.commercialNotice')}</p>
        </div>
      </StatusDialog>
    </>
  );
}
