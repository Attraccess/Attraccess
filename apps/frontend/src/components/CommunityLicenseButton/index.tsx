import { HeartHandshakeIcon } from 'lucide-react';
import { ConfirmableButton, I18nTransComponent, useTranslations } from '@attraccess/plugins-frontend-ui';
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

  return (
    <ConfirmableButton
      label={t('button')}
      icon={<HeartHandshakeIcon size={16} />}
      status="warning"
      isDisabled={isDisabled}
      data-cy={rest['data-cy'] ?? 'community-license-button'}
      confirm={{
        title: t('modal.title'),
        message: (
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
        ),
        confirmLabel: t('modal.confirm'),
        cancelLabel: t('modal.cancel'),
        cancelDataCy: 'community-license-cancel',
        confirmDataCy: 'community-license-confirm',
      }}
      onConfirm={() => onAccept(COMMUNITY_LICENSE_KEY)}
    />
  );
}
