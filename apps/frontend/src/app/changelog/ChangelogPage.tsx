import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// eslint-disable-next-line @nx/enforce-module-boundaries
import changelog from '../../../../../CHANGELOG.md?raw';
import { PageHeader } from '../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

export default function ChangelogPage() {
  const {t} = useTranslations('changelog', {
    de,
    en
  });

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <PageHeader title={t('title')} />
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{changelog}</ReactMarkdown>
      </div>
    </div>
  );
}
