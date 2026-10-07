import { SupervisedStartModalProps } from './index.contracts';
import { useSupervisedStartModalStateInputs } from './useSupervisedStartModalStateInputs';
import { useSupervisedStartModalStateOutput } from './useSupervisedStartModalStateOutput';

export function useSupervisedStartModalState({
  isOpen,
  onClose,
  resourceId,
  requestBody,
  onApproved,
}: Readonly<SupervisedStartModalProps>) {
  const useSupervisedStartModalStateInputsModel = useSupervisedStartModalStateInputs({
    isOpen,
    onClose,
    resourceId,
    requestBody,
    onApproved,
  });
  return useSupervisedStartModalStateOutput(useSupervisedStartModalStateInputsModel);
}
