import { FormResponseDto, FormSubmissionRequestDto } from '@attraccess/react-query-client';
import { ResourceFormAction } from '../../details/forms/types';

export interface ResourceFormsModalProps {
  isOpen: boolean;
  action: ResourceFormAction;
  forms: FormResponseDto[];
  initialSubmissions?: FormSubmissionRequestDto[];
  onSubmit: (payload: FormSubmissionRequestDto[]) => void;
  onCancel: () => void;
}
