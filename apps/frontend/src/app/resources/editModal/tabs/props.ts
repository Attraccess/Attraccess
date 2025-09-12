import { Resource, UpdateResourceDto } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';

export interface EditorTabProps {
  t: TFunction;
  formData: UpdateResourceDto;
  setField: (field: keyof UpdateResourceDto, value: UpdateResourceDto[keyof UpdateResourceDto]) => void;
  resource?: Resource;
}
