import { FormResponseDto } from '@attraccess/react-query-client';
import { FormSubmissionRequestDto } from '@attraccess/react-query-client';
import { ResourceFormAction } from '../../details/forms/types';
export type FieldValue = string | boolean;

export interface ResourceFormsModalProps {
  isOpen: boolean;
  action: ResourceFormAction;
  forms: FormResponseDto[];
  onSubmit: (payload: FormSubmissionRequestDto[]) => void;
  onCancel: () => void;
}
