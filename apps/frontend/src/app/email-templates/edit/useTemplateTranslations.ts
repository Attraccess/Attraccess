import { useQueryClient } from '@tanstack/react-query';
import {
  EmailTemplateType,
  useEmailTemplateControllerGetTranslations,
  useEmailTemplateControllerSetTranslations,
  useEmailTemplateControllerDeleteTranslations,
  UseEmailTemplateControllerGetTranslationsKeyFn,
} from '@attraccess/react-query-client';

export function useTemplateTranslations(templateType: EmailTemplateType | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: UseEmailTemplateControllerGetTranslationsKeyFn({ path: { type: templateType as EmailTemplateType } }),
    });

  const query = useEmailTemplateControllerGetTranslations(
    { path: { type: templateType as EmailTemplateType } },
    undefined,
    { enabled: !!templateType },
  );

  const saveMutation = useEmailTemplateControllerSetTranslations(undefined, {
    onSuccess: invalidate,
  });

  const deleteMutation = useEmailTemplateControllerDeleteTranslations(undefined, {
    onSuccess: invalidate,
  });

  return { query, saveMutation, deleteMutation };
}
