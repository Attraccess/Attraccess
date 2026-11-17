import type { QueryClient } from '@tanstack/react-query';
import {
  UseResourceFormsServiceResourceFormsGetOneKeyFn,
  UseResourceFormsServiceResourceFormsListKeyFn,
} from '@attraccess/react-query-client';
import { EditableForm, serializeFieldOptions } from '../types';

export const EMPTY_FORM: EditableForm = {
  name: '',
  isRequiredOnResourceUsageStart: false,
  isRequiredOnResourceUsageTakeOver: false,
  isRequiredOnResourceUsageEnd: false,
  fields: [],
};

export function buildRequestBody(form: EditableForm) {
  return {
    name: form.name,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
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

export async function invalidateFormQueries(resourceId: number, queryClient: QueryClient, formId?: number) {
  await queryClient.invalidateQueries({
    queryKey: UseResourceFormsServiceResourceFormsListKeyFn({ resourceId }),
  });
  if (formId) {
    await queryClient.invalidateQueries({
      queryKey: UseResourceFormsServiceResourceFormsGetOneKeyFn({ resourceId, formId }),
    });
  }
}

export function sanitizeFormPayload(form: EditableForm) {
  return {
    name: form.name,
    isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
    isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
    isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
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
