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
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { dependencyError } from './index.dependency-error.helpers';
import { usePluginsSectionState } from './usePluginsSectionState';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'pluginToDelete'
  | 'setPluginToDelete'
  | 't'
  | 'deletingPlugin'
  | 'deletingNpm'
  | 'isResolvingRemoval'
  | 'dependantsToRemove'
  | 'removeDependantsApproved'
  | 'setApprovedRemovalPlan'
  | 'removalApprovalToken'
  | 'removalPlanError'
  | 'removeFailure'
  | 'isDeleting'
  | 'isRemovingGraph'
  | 'deleteConfirmedPlugin'
  | 'removalPlan'
>;
export function PluginsSectionStandardModalDeleteConfirmationTitle({
  pluginToDelete,
  setPluginToDelete,
  t,
  deletingPlugin,
  deletingNpm,
  isResolvingRemoval,
  dependantsToRemove,
  removeDependantsApproved,
  setApprovedRemovalPlan,
  removalApprovalToken,
  removalPlanError,
  removeFailure,
  isDeleting,
  isRemovingGraph,
  deleteConfirmedPlugin,
  removalPlan,
}: Props) {
  return (
    <StandardModal
      isOpen={pluginToDelete !== null}
      onOpenChange={(open) => !open && setPluginToDelete(null)}
      data-cy="plugins-list-delete-confirmation-modal"
      size="sm"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            <ModalHeading>{t('deleteConfirmation.title')}</ModalHeading>
          </ModalHeader>
          <ModalBody>
            <p>{t('deleteConfirmation.message', { pluginName: deletingPlugin?.name ?? '' })}</p>
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
                Boolean(deletingNpm) &&
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
