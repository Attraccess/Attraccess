import { Button, LabeledSwitch, StandardModal } from '@attraccess/plugins-frontend-ui';
import {
  useDeletePlugin,
  useGetPlugins,
  usePluginControllerRemovalPlan,
  usePluginControllerRemovePackageGraph,
} from '@attraccess/react-query-client';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
} from '@heroui/react';
import { useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { reloadPage } from '../../../../../utils/reloadPage';
import { dependencyError } from '../dependencies/dependencyError';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { useInstalledNpmPlugins } from './useInstalledNpmPlugins';

interface Props {
  /** The id of the plugin to remove; the dialog is open while this is set. */
  pluginId: string | null;
  onClose: () => void;
}

export function RemovePluginModal({ pluginId, onClose }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { data: plugins } = useGetPlugins();
  const { installedByDirectory } = useInstalledNpmPlugins();
  const [approvedRemovalPlan, setApprovedRemovalPlan] = useState<string | null>(null);
  const [removeFailure, setRemoveFailure] = useState<string | null>(null);

  const dismiss = () => {
    setApprovedRemovalPlan(null);
    setRemoveFailure(null);
    onClose();
  };

  const { mutate: deletePlugin, isPending: isDeleting } = useDeletePlugin(undefined, {
    onSuccess: () => {
      // The server drops the plugin's bundle from the served asset set, so the running frontend is
      // holding modules that no longer exist: one page reload (not a server restart) gets back to a
      // consistent app, and the restart banner shows after it.
      dismiss();
      toast.success({
        title: t('success.delete.title'),
        description: t('success.delete.description'),
      });
      reloadPage();
    },
    onError: () => {
      toast.error({ title: t('error.delete.title'), description: t('error.delete.description') });
    },
  });
  const { mutateAsync: removePackageGraph, isPending: isRemovingGraph } = usePluginControllerRemovePackageGraph();

  const deletingPlugin = plugins?.find((plugin) => plugin.id === pluginId);
  const deletingNpm = Boolean(deletingPlugin && installedByDirectory.has(deletingPlugin.pluginDirectory));
  // What happens to the data depends on the path: npm keeps it, a refused plugin's tables stay (its code never
  // runs), and deleting an uploaded plugin drops its tables.
  const removalMessage = deletingNpm
    ? 'deleteConfirmation.messageRegistry'
    : deletingPlugin?.refused
      ? 'deleteConfirmation.messageRefused'
      : 'deleteConfirmation.messageUploaded';
  const {
    data: removalPlan,
    error: removalPlanError,
    isFetching: isResolvingRemoval,
  } = usePluginControllerRemovalPlan({ path: { packageName: deletingPlugin?.name ?? '' } }, undefined, {
    enabled: deletingNpm,
    staleTime: 0,
    retry: false,
  });
  const dependantsToRemove = removalPlan?.filter((plugin) => plugin.name !== deletingPlugin?.name) ?? [];
  const removalApprovalToken = JSON.stringify(removalPlan?.map(({ name, version }) => ({ name, version })));
  const removeDependantsApproved = Boolean(removalApprovalToken && approvedRemovalPlan === removalApprovalToken);

  const deleteConfirmedPlugin = async () => {
    if (!pluginId) return;
    if (!deletingNpm) {
      deletePlugin({ path: { pluginId } });
      return;
    }
    try {
      await removePackageGraph({
        path: { packageName: deletingPlugin.name },
        body: { approvedDependants: dependantsToRemove.map(({ name }) => name) },
      });
      dismiss();
      toast.success({
        title: t('success.delete.title'),
        description: t('success.delete.description'),
      });
      reloadPage();
    } catch (error) {
      setRemoveFailure(dependencyError(error));
    }
  };

  return (
    <StandardModal
      isOpen={pluginId !== null}
      onOpenChange={(open) => !open && dismiss()}
      data-cy="plugins-list-delete-confirmation-modal"
      size="sm"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('deleteConfirmation.title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p data-cy="plugins-list-delete-confirmation-message">
              {t(removalMessage, { pluginName: deletingPlugin?.name ?? '' })}
            </p>
            {deletingNpm && isResolvingRemoval ? <p role="status">{t('dependencies.loading')}</p> : null}
            {dependantsToRemove.length ? (
              <Alert status="warning">
                <AlertContent>
                  <AlertTitle>{t('dependencies.requiredBy')}</AlertTitle>
                  <AlertDescription>{t('dependencies.removalDescription')}</AlertDescription>
                  <ul>
                    {dependantsToRemove.map((plugin) => (
                      <li key={plugin.name} className="break-words">
                        {plugin.name} · {plugin.version}
                      </li>
                    ))}
                  </ul>
                  <LabeledSwitch
                    isSelected={removeDependantsApproved}
                    onChange={(approved) => setApprovedRemovalPlan(approved ? removalApprovalToken : null)}
                  >
                    {t('dependencies.removeTogether')}
                  </LabeledSwitch>
                </AlertContent>
              </Alert>
            ) : null}
            {removalPlanError || removeFailure ? (
              <p role="alert" className="text-danger">
                {removeFailure ?? dependencyError(removalPlanError)}
              </p>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              onPress={close}
              isDisabled={isDeleting || isRemovingGraph}
              data-cy="plugins-list-delete-confirmation-cancel-button"
            >
              {t('deleteConfirmation.cancel')}
            </Button>
            <Button
              variant="danger"
              onPress={() => void deleteConfirmedPlugin()}
              isPending={isDeleting || isRemovingGraph}
              isDisabled={
                deletingNpm &&
                (isResolvingRemoval ||
                  !removalPlan ||
                  Boolean(removalPlanError) ||
                  (dependantsToRemove.length > 0 && !removeDependantsApproved))
              }
              data-cy="plugins-list-delete-confirmation-delete-button"
            >
              {t('deleteConfirmation.delete')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
