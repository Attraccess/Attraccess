import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip } from '@heroui/react';

import de from './de.json';
import en from './en.json';

interface Props {
  isValid: boolean;
}

export function IntroductionStatusChip(props: Readonly<Props>) {
  const { t } = useTranslations({ de, en });

  if (props.isValid) {
    return <Chip color="success">{t('status.isValid')}</Chip>;
  }
  return <Chip color="danger">{t('status.isInvalid')}</Chip>;
}
