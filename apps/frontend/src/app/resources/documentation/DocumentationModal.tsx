import { memo, useCallback, useState, useEffect } from 'react';
import { ModalBody, ModalFooter, ModalHeader, Spinner, useOverlayState } from '@heroui/react';
import { Button } from '../../../components/button';
import { StandardModal } from '../../../components/standardModal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Edit, ExternalLink, Maximize, Minimize, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import en from './documentationModal.en.json';
import de from './documentationModal.de.json';
import { useAuth } from '../../../hooks/useAuth';
import { Markdown } from '../../../components/markdown';

interface DocumentationModalProps {
  resourceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

function DocumentationModalComponent({ resourceId, children }: Readonly<DocumentationModalProps>) {
  const { isOpen, open, setOpen } = useOverlayState();
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

  const canManageResources = hasPermission('resources.update');

  const renderDocumentationContent = useCallback(() => {
    if (isLoading || isFetching) {
      return (
        <div className="flex justify-center p-4">
          <Spinner color="accent" data-cy="documentation-modal-loading-spinner" />
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center gap-4 p-4">
          <p className="text-danger">{error instanceof Error ? error.message : t('error.unknown')}</p>
          <Button variant="secondary" onPress={() => refetch()} data-cy="documentation-modal-error-retry-button">
            <RefreshCw size={16} />
            {t('actions.retry')}
          </Button>
        </div>
      );
    }

    if (!resource?.documentationType) {
      return <p className="text-center text-default-400 p-4">{t('noDocumentation')}</p>;
    }

    if (resource.documentationType === 'markdown' && resource.documentationMarkdown) {
      return <Markdown className="p-6">{resource.documentationMarkdown}</Markdown>;
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

  return (
    <>
      {children(open)}

      <StandardModal
        isOpen={isOpen}
        onOpenChange={setOpen}
        data-cy="documentation-modal"
        size={isFullscreen ? 'full' : 'lg'}
        /*
          The "lg" size only caps max-width; a documentation URL renders in an
          iframe that has no intrinsic width, so the dialog would otherwise
          collapse to a narrow column. Force a wide, viewport-bounded width
          (overriding the size's max-width) so websites are actually readable.
          On phones the dialog fills the available width; from `sm` up it grows
          to a fixed wide size (the modal container is only width-fit there).
        */
        dialogProps={{ className: isFullscreen ? undefined : 'w-full max-w-[95vw] sm:w-[72rem]' }}
      >
        {({ close }) => (
          <>
            <ModalHeader className="flex justify-between items-center">
              <div>{t('title')}</div>
              <div className="flex gap-1">
                {canManageResources && (
                  <Button
                    variant="secondary"
                    isIconOnly
                    onPress={handleEditDocumentation}
                    aria-label={t('actions.edit')}
                    data-cy="documentation-modal-edit-button"
                  >
                    <Edit size={16} />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  isIconOnly
                  onPress={toggleFullscreen}
                  aria-label={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
                  data-cy="documentation-modal-fullscreen-button"
                >
                  {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </Button>

                <Button
                  variant="secondary"
                  isIconOnly
                  onPress={handleOpenInNewTab}
                  aria-label={t('actions.openInNewTab')}
                  data-cy="documentation-modal-open-in-new-tab-button"
                >
                  <ExternalLink size={16} />
                </Button>

                {resource?.documentationType === 'url' && (
                  <Button
                    variant="secondary"
                    isIconOnly
                    onPress={() => refetch()}
                    isPending={isFetching}
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
              <Button variant="ghost" onPress={close} data-cy="documentation-modal-close-button">
                {t('actions.close')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </>
  );
}

export const DocumentationModal = memo(DocumentationModalComponent);
