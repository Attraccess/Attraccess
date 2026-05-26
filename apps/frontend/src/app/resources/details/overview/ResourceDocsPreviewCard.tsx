// Documentation preview card opens existing DocumentationModal for full view
// FEATURE: ATT-386 Resource details page Overview tab
import { useMemo } from 'react';
import { Button } from '@heroui/react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { FlatSection } from '../../../../components/flatSection';
import { Markdown } from '../../../../components/markdown';
import { DocumentationModal } from '../../documentation';
import en from './resourceDocsPreviewCard.en.json';
import de from './resourceDocsPreviewCard.de.json';

interface ResourceDocsPreviewCardProps {
  resourceId: number;
}

const PREVIEW_CHAR_COUNT = 220;

export function ResourceDocsPreviewCard({ resourceId }: ResourceDocsPreviewCardProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canManageResources = hasPermission('canManageResources');
  const navigate = useNavigate();

  const { data: resource, isLoading } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const markdown = resource?.documentationType === 'markdown' ? (resource.documentationMarkdown ?? '') : '';

  const previewText = useMemo(() => {
    if (!markdown) return '';
    return markdown.length > PREVIEW_CHAR_COUNT
      ? markdown.slice(0, PREVIEW_CHAR_COUNT).trimEnd() + '…'
      : markdown;
  }, [markdown]);

  if (isLoading) {
    return (
      <FlatSection icon={<BookOpen className="w-4 h-4" />} title={t('title')} data-cy="docs-preview-card">
        <div className="h-8" />
      </FlatSection>
    );
  }

  if (!previewText) {
    if (!canManageResources) return null;
    return (
      <FlatSection
        icon={<BookOpen className="w-4 h-4" />}
        title={t('title')}
        data-cy="docs-preview-card"
      >
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="text-sm text-foreground-500">{t('empty')}</span>
          <Button
            size="sm"
            variant="ghost"
            onPress={() => navigate(`/resources/${resourceId}/documentation/edit`)}
            data-cy="docs-preview-add"
          >
            {t('addCta')}
          </Button>
        </div>
      </FlatSection>
    );
  }

  return (
    <FlatSection
      icon={<BookOpen className="w-4 h-4" />}
      title={t('title')}
      data-cy="docs-preview-card"
      actions={
        <DocumentationModal resourceId={resourceId}>
          {(onOpen) => (
            <Button size="sm" variant="ghost" onPress={onOpen} data-cy="docs-preview-open">
              {t('openFull')}
            </Button>
          )}
        </DocumentationModal>
      }
    >
      <Markdown variant="compact" data-cy="docs-preview-content">
        {previewText}
      </Markdown>
    </FlatSection>
  );
}
