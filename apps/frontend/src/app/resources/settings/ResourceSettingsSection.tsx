import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import en from './en.json';
import de from './de.json';

export function ResourceSettingsSection({
  topic,
  children,
}: {
  topic: 'groups' | 'forms' | 'flows' | 'diagnostics';
  children: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex h-full min-h-0 flex-col gap-4" data-cy={`resource-settings-${topic}`}>
      <PageHeader
        title={t(`topics.${topic}.title`)}
        subtitle={t(`topics.${topic}.description`)}
        backTo={`/resources/${id}/settings`}
        noMargin
      />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
