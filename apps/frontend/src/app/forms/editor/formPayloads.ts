import type { QueryClient } from '@tanstack/react-query';
import {
  FormFieldType,
  FormResponseDto,
  FormScope,
  useFormsGetOneKey,
  useFormsListKey,
  useFormsListResourcesKey,
  useResourceFormsListKey,
} from '@attraccess/react-query-client';
import { EditableForm, ImageFieldOptions, parseFieldFromResponse, serializeFieldOptions } from '../types';
import { isValidFormImageLimit } from '@attraccess/application-models';

export const EMPTY_FORM: EditableForm = {
  name: '',
  scope: FormScope.GLOBAL,
  resourceId: null,
  groupId: null,
  isRequiredOnResourceUsageStart: false,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  isRequiredOnResourceUsageProjectSwitch: false,
  fields: [],
};

/** The editable copy of a stored form. */
export function toEditableForm(form: FormResponseDto): EditableForm {
  return {
    name: form.name,
    scope: form.scope,
    resourceId: form.resourceId ?? null,
    groupId: form.groupId ?? null,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    isRequiredOnResourceUsageProjectSwitch: form.isRequiredOnResourceUsageProjectSwitch,
    fields: form.fields.map((field) => parseFieldFromResponse(field)),
  };
}

/** Whether every image field has a max-images option the API accepts (the options editor flags the others). */
export function hasValidImageFields(form: EditableForm): boolean {
  return form.fields.every(
    (field) =>
      field.type !== FormFieldType.IMAGE || isValidFormImageLimit((field.options as ImageFieldOptions).maxImages),
  );
}

/** Whether the scope names the owner it needs. */
export function hasScopeOwner(form: EditableForm): boolean {
  if (form.scope === FormScope.RESOURCE) return form.resourceId !== null;
  if (form.scope === FormScope.GROUP) return form.groupId !== null;
  return true;
}

export function buildRequestBody(form: EditableForm) {
  return {
    name: form.name,
    scope: form.scope,
    resourceId: form.scope === FormScope.RESOURCE ? form.resourceId : null,
    groupId: form.scope === FormScope.GROUP ? form.groupId : null,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    isRequiredOnResourceUsageProjectSwitch: form.isRequiredOnResourceUsageProjectSwitch,
    fields: form.fields.map((field, index) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description?.trim() || undefined,
      options: serializeFieldOptions(field.type, field.options) ?? undefined,
      position: index,
    })),
  };
}

/** A form change can show up in every list of forms and on every resource it applies to. */
export async function invalidateFormQueries(queryClient: QueryClient) {
  await Promise.all(
    [useFormsListKey, useFormsGetOneKey, useFormsListResourcesKey, useResourceFormsListKey].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export function sanitizeFormPayload(form: EditableForm) {
  return {
    ...buildRequestBody(form),
    fields: form.fields.map((field, index) => ({
      id: field.id ?? null,
      name: field.name,
      type: field.type,
      isRequired: field.isRequired,
      description: field.description?.trim() || '',
      options: serializeFieldOptions(field.type, field.options),
      position: index,
    })),
  };
}
