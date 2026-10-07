import { useFormEditorPageStateInputs } from './useFormEditorPageStateInputs';
import { useFormEditorPageStateOutput } from './useFormEditorPageStateOutput';

export function useFormEditorPageState() {
  const useFormEditorPageStateInputsModel = useFormEditorPageStateInputs();
  return useFormEditorPageStateOutput(useFormEditorPageStateInputsModel);
}
