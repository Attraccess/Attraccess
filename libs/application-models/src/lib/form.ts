export enum FormFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  IMAGE = 'image',
}

export enum ResourceFormAction {
  START = 'start',
  TAKEOVER = 'takeover',
  END = 'end',
  /** Required when the owner of a running session moves it to another project. */
  PROJECT_SWITCH = 'project-switch',
}

/** Where a form applies: one resource, every resource of a resource group, or every resource. */
export type FormScope = 'resource' | 'group' | 'global';

export const FORM_SCOPES: readonly FormScope[] = ['resource', 'group', 'global'];
