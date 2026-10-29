import {
  ProgressCircle,
  ProgressCircleFillCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
} from '@heroui/react';
import { useTranslations } from '../../i18n';
import en from './en.json';
import de from './de.json';

export const TableDataLoadingIndicator = () => {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex justify-center items-center p-4">
      <ProgressCircle isIndeterminate aria-label={t('loading')}>
        <ProgressCircleTrack>
          <ProgressCircleTrackCircle />
          <ProgressCircleFillCircle />
        </ProgressCircleTrack>
      </ProgressCircle>
    </div>
  );
};
