import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { Property } from './property-input';
export const configProperty = (schema: ResourceFlowNodeSchemaDto) => {
  const configSchema = { ...schema.configSchema };
  delete configSchema.preview;
  return { ...configSchema, type: 'object' } as Property<unknown>;
};
