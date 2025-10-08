import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { PageHeader } from '../../../../components/pageHeader';
import { SumUpIcon } from '../../../../components/icons/sumup.icon';
import { SumUpConfigurationCard } from './configuration';
import { SumUpReadersCard } from './readers';

export function SumUpPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<SumUpIcon width={24} height={24} />}
        backTo="/billing/administration"
      />

      <div className="flex flex-row flex-wrap gap-4 items-stretch">
        <SumUpConfigurationCard className="flex-grow" />

        <SumUpReadersCard className="flex-grow" />
      </div>
    </div>
  );
}
