import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const RISKS = ['brickWindows', 'power', 'noFlashing', 'signedOnly', 'noMove', 'backup'] as const;

/** The first step of "Secure this reader": what securing changes for good, before anything is asked of the reader. */
export function SecureReaderRiskDialog({ isOpen, onClose, onContinue }: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  return (
    <StatusDialog
      isOpen={isOpen}
      onClose={onClose}
      status="warning"
      title={t('risk.title')}
      action={{ label: t('risk.continue'), onPress: onContinue, 'data-cy': 'secure-conversion-risk-continue' }}
      data-cy="secure-conversion-risk"
    >
      <div className="flex flex-col gap-2 text-sm">
        <p>{t('risk.intro')}</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {RISKS.map((risk) => (
            <li key={risk}>{t(`risk.${risk}`)}</li>
          ))}
        </ul>
      </div>
    </StatusDialog>
  );
}
