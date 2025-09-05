import { Resource, UpdateResourceDto } from '@attraccess/react-query-client';
import { TFunction } from 'i18next';

export interface EditorTabProps {
  t: TFunction;
  formData: UpdateResourceDto;
  setField: (field: keyof UpdateResourceDto, value: UpdateResourceDto[keyof UpdateResourceDto]) => void;
  resource?: Resource;
}
