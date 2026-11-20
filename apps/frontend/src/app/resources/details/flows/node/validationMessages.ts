import type { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';

/** One API validation error of a node. A missing `code` (older APIs, plugins) means `invalid`. */
export interface NodeValidationError {
  field: string;
  code?: 'required' | 'invalid';
  message: string;
}

interface Options {
  schema: ResourceFlowNodeSchemaDto;
  t: TFunction;
  tExists?: TExists;
}

function fieldLabel(field: string, { schema, t, tExists }: Options): string | undefined {
  const name = field.split('.')[0];
  const key = `nodes.${schema.type}.config.${name}.label`;
  if (tExists?.(key)) {
    return t(key);
  }
  // Plugin nodes have no static translations; their editor labels come from the schema title.
  const properties = schema.configSchema?.properties as Record<string, { title?: unknown }> | undefined;
  const title = properties?.[name]?.title;
  return typeof title === 'string' && title ? title : undefined;
}

/** One short line per error, naming the field in the user's language when the node has a label for it. */
export function validationMessages(errors: readonly NodeValidationError[], options: Options): string[] {
  return errors.map((error) => {
    const field = fieldLabel(error.field, options);
    if (!field) {
      return error.message;
    }
    return error.code === 'required'
      ? options.t('validation.required', { field })
      : options.t('validation.invalid', { field, message: error.message });
  });
}
