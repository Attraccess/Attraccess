import { Resource, UpdateResourceDto } from '@attraccess/react-query-client';

export interface EditorTabProps {
  formData: UpdateResourceDto;
  setField: (field: keyof UpdateResourceDto, value: UpdateResourceDto[keyof UpdateResourceDto]) => void;
  resource?: Resource;
}
