// eslint-disable-next-line @nx/enforce-module-boundaries
import changelog from '../../../../../CHANGELOG.md?raw';
import { PageHeader } from '../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Markdown } from '../../components/markdown';

import de from './de.json';
import en from './en.json';

export default function ChangelogPage() {
  const { t } = useTranslations({
    de,
    en,
  });

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <PageHeader title={t('title')} />
      <Markdown>{changelog}</Markdown>
    </div>
  );
}
