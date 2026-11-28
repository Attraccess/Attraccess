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
  /** Required when the owner splits a running session: usage from now on is booked to another project. */
  PROJECT_SWITCH = 'project-switch',
  /** Required when the owner moves the whole running session to another project. */
  PROJECT_REASSIGN = 'project-reassign',
}

/** Where a form applies: one resource, every resource of a resource group, or every resource. */
export type FormScope = 'resource' | 'group' | 'global';

export const FORM_SCOPES: readonly FormScope[] = ['resource', 'group', 'global'];
