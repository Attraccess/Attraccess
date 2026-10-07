import { EditableForm } from './types';
export const EMPTY_FORM: EditableForm = {
  name: '',
  isRequiredOnResourceUsageStart: false,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  fields: [],
};
