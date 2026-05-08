import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Progress } from "../../utils/heroui-compat";
import { UnauthorizedLayout } from '../../app/unauthorized/unauthorized-layout/layout';
import { PageHeader } from '../pageHeader';

import de from './de.json';
import en from './en.json';

export function BootScreen() {
  const { t } = useTranslations({ de, en });

  return (
    <UnauthorizedLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Progress isIndeterminate aria-label={t('progress.ariaLabel')} />
    </UnauthorizedLayout>
  );
}
