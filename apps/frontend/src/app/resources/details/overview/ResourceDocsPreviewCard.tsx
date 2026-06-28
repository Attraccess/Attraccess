// Documentation preview card opens existing DocumentationModal for full view
// FEATURE: ATT-386 Resource details page Overview tab
import { useMemo } from 'react';
import { Button } from '@heroui/react';
import { BookOpen, ExternalLink } from 'lucide-react';
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
  className?: string;
}

const PREVIEW_CHAR_COUNT = 220;

export function ResourceDocsPreviewCard({ resourceId, className }: ResourceDocsPreviewCardProps) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canUpdateResources = hasPermission('resources.update');
  const navigate = useNavigate();

  const { data: resource, isLoading } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const documentationType = resource?.documentationType;
  const markdown = documentationType === 'markdown' ? (resource?.documentationMarkdown ?? '') : '';
  const url = documentationType === 'url' ? (resource?.documentationUrl ?? '') : '';

  const previewText = useMemo(() => {
    if (!markdown) return '';
    return markdown.length > PREVIEW_CHAR_COUNT
      ? markdown.slice(0, PREVIEW_CHAR_COUNT).trimEnd() + '…'
      : markdown;
  }, [markdown]);

  const hasContent = Boolean(previewText) || Boolean(url);

  if (isLoading) {
    return (
      <FlatSection className={className} icon={<BookOpen className="w-4 h-4" />} title={t('title')} data-cy="docs-preview-card">
        <div className="h-8" />
      </FlatSection>
    );
  }

  if (!hasContent) {
    if (!canUpdateResources) return null;
    return (
      <FlatSection
        className={className}
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
      className={className}
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
      {previewText && (
        <Markdown variant="compact" data-cy="docs-preview-content">
          {previewText}
        </Markdown>
      )}
      {url && (
        <div className="flex items-center gap-2 py-1 text-sm text-foreground-600">
          <ExternalLink className="w-4 h-4 shrink-0 text-foreground-500" />
          <span className="truncate" data-cy="docs-preview-url">
            {url}
          </span>
        </div>
      )}
    </FlatSection>
  );
}
