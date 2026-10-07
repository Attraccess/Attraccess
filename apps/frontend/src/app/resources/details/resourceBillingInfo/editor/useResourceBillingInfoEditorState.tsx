import { Props } from './index.props';
import { useResourceBillingInfoEditorStateInputs } from './useResourceBillingInfoEditorStateInputs';
import { useResourceBillingInfoEditorStateOutput } from './useResourceBillingInfoEditorStateOutput';

export function useResourceBillingInfoEditorState(props: Props) {
  const useResourceBillingInfoEditorStateInputsModel = useResourceBillingInfoEditorStateInputs(props);
  return useResourceBillingInfoEditorStateOutput(useResourceBillingInfoEditorStateInputsModel);
}
