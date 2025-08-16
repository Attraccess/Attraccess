import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// eslint-disable-next-line @nx/enforce-module-boundaries
import changelog from '../../../../../CHANGELOG.md?raw';
import { PageHeader } from '../../components/pageHeader';

export default function ChangelogPage() {
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <PageHeader title="Changelog" />
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{changelog}</ReactMarkdown>
      </div>
    </div>
  );
}
