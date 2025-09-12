import { memo, useCallback, useState, useEffect } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  useDisclosure,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Edit, ExternalLink, Maximize, Minimize, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import en from './documentationModal.en.json';
import de from './documentationModal.de.json';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../../hooks/useAuth';

interface DocumentationModalProps {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

function DocumentationModalComponent({ resourceId, children }: Readonly<DocumentationModalProps>) {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const navigate = useNavigate();

  const { t } = useTranslations({
    en,
    de,
  });

  const {
    data: resource,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useResourcesServiceGetOneResourceById({ id: resourceId }, undefined, { enabled: !!isOpen });

  // When modal opens, ensure we have fresh data
  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleEditDocumentation = useCallback(() => {
    navigate(`/resources/${resourceId}/documentation/edit`);
  }, [navigate, resourceId]);

  const handleOpenInNewTab = useCallback(() => {
    if (resource?.documentationType === 'url' && resource?.documentationUrl) {
      window.open(resource.documentationUrl, '_blank');
    } else if (resource?.documentationType === 'markdown') {
      window.open(`/resources/${resourceId}/documentation`, '_blank');
    }
  }, [resource, resourceId]);

  const { hasPermission } = useAuth();

  const canManageResources = hasPermission('canManageResources');

  const renderDocumentationContent = useCallback(() => {
    if (isLoading || isFetching) {
      return (
        <div className="flex justify-center p-4">
          <Spinner size="lg" label={t('loading')} color="primary" data-cy="documentation-modal-loading-spinner" />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center gap-4 p-4">
          <p className="text-danger">{error instanceof Error ? error.message : t('error.unknown')}</p>
          <Button
            color="primary"
            variant="flat"
            onPress={() => refetch()}
            startContent={<RefreshCw size={16} />}
            data-cy="documentation-modal-error-retry-button"
          >
            {t('actions.retry')}
          </Button>
        </div>
      );
    }

    if (!resource?.documentationType) {
      return <p className="text-center text-default-400 p-4">{t('noDocumentation')}</p>;
    }

    if (resource.documentationType === 'markdown' && resource.documentationMarkdown) {
      return (
        <div
          className="prose prose-slate dark:prose-invert max-w-none p-6 
                        prose-headings:text-foreground prose-headings:font-semibold
                        prose-h1:text-2xl prose-h1:border-b prose-h1:border-divider prose-h1:pb-2
                        prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
                        prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                        prose-p:text-foreground prose-p:leading-relaxed
                        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                        prose-strong:text-foreground prose-strong:font-semibold
                        prose-code:text-primary prose-code:bg-default-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                        prose-pre:bg-default-100 prose-pre:border prose-pre:border-divider prose-pre:rounded-lg
                        prose-blockquote:border-l-primary prose-blockquote:bg-default-50 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:text-foreground-600
                        prose-ul:text-foreground prose-ol:text-foreground
                        prose-li:text-foreground prose-li:marker:text-foreground-400
                        prose-hr:border-divider
                        prose-table:text-foreground prose-thead:border-divider prose-tbody:border-divider prose-th:text-foreground prose-td:text-foreground"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{resource.documentationMarkdown}</ReactMarkdown>
        </div>
      );
    }

    if (resource.documentationType === 'url' && resource.documentationUrl) {
      return (
        <iframe
          src={resource.documentationUrl}
          className="w-full h-full border-0 min-h-[50vh]"
          title={`${resource.name} Documentation`}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      );
    }

    return <p className="text-center text-default-400 p-4">{t('noDocumentation')}</p>;
  }, [isLoading, isFetching, isError, error, resource, refetch, t]);

  const modalSize = isFullscreen ? 'full' : '5xl';

  return (
    <>
      {children(onOpen)}

      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size={modalSize}
        scrollBehavior="inside"
        data-cy="documentation-modal"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex justify-between items-center">
                <div>{t('title')}</div>
                <div className="flex gap-1">
                  {canManageResources && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      onPress={handleEditDocumentation}
                      aria-label={t('actions.edit')}
                      data-cy="documentation-modal-edit-button"
                    >
                      <Edit size={16} />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    onPress={toggleFullscreen}
                    aria-label={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
                    data-cy="documentation-modal-fullscreen-button"
                  >
                    {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                  </Button>

                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    onPress={handleOpenInNewTab}
                    aria-label={t('actions.openInNewTab')}
                    data-cy="documentation-modal-open-in-new-tab-button"
                  >
                    <ExternalLink size={16} />
                  </Button>

                  {resource?.documentationType === 'url' && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      onPress={() => refetch()}
                      isLoading={isFetching}
                      aria-label={t('actions.refresh')}
                      data-cy="documentation-modal-refresh-button"
                    >
                      <RefreshCw size={16} />
                    </Button>
                  )}
                </div>
              </ModalHeader>
              <ModalBody>{renderDocumentationContent()}</ModalBody>
              <ModalFooter>
                <Button color="primary" variant="light" onPress={onClose} data-cy="documentation-modal-close-button">
                  {t('actions.close')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

export const DocumentationModal = memo(DocumentationModalComponent);
