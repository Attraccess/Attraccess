import type { TExists, TFunction } from '@attraccess/plugins-frontend-ui';
import type {
  FlowValidationErrorCode,
  ResourceFlowNodeSchemaDto,
  ValidationErrorDto,
} from '@attraccess/react-query-client';

/** One API validation error of a node. A missing `code` (older APIs) means `invalid`. */
export type NodeValidationError = Pick<ValidationErrorDto, 'field' | 'message'> & {
  code?: `${FlowValidationErrorCode}`;
};

interface Options {
  schema: ResourceFlowNodeSchemaDto;
  t: TFunction;
  tExists?: TExists;
}

/** The field's label as the node editor shows it: the schema title, else the node's translation. */
function fieldLabel(field: string, { schema, t, tExists }: Options): string | undefined {
  const name = field.split('.')[0];
  const properties = schema.configSchema?.properties as Record<string, { title?: unknown }> | undefined;
  const title = properties?.[name]?.title;
  if (typeof title === 'string' && title) {
    return title;
  }
  const key = `nodes.${schema.type}.config.${name}.label`;
  return tExists?.(key) ? t(key) : undefined;
}

/** One short line per error, naming the field in the user's language when the node has a label for it. */
export function validationMessages(errors: readonly NodeValidationError[], options: Options): string[] {
  return errors.map((error) => {
    const field = fieldLabel(error.field, options);
    // The label names only the first path segment, so "<label> is missing" would be wrong for a nested value.
    if (field && error.code === 'required' && !error.field.includes('.')) {
      return options.t('validation.required', { field });
    }
    // Some schema messages already start with the field's name ("Duration must be …").
    if (!field || error.message.startsWith(`${field} `)) {
      return error.message;
    }
    return options.t('validation.invalid', { field, message: error.message });
  });
}
