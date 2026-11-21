export enum FormFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
}

export enum ResourceFormAction {
  START = 'start',
  TAKEOVER = 'takeover',
  END = 'end',
}

/** Where a form applies: one resource, every resource of a resource group, or every resource. */
export type FormScope = 'resource' | 'group' | 'global';

export const FORM_SCOPES: readonly FormScope[] = ['resource', 'group', 'global'];
