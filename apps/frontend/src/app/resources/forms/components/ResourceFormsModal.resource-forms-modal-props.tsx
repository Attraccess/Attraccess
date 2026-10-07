import { FormResponseDto, FormSubmissionRequestDto } from '@attraccess/react-query-client';
import { ResourceFormAction } from '../../details/forms/types';

export interface ResourceFormsModalProps {
  isOpen: boolean;
  action: ResourceFormAction;
  forms: FormResponseDto[];
  onSubmit: (payload: FormSubmissionRequestDto[]) => void;
  onCancel: () => void;
}
