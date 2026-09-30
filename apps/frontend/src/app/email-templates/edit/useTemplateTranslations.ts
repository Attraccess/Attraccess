import { useQueryClient } from '@tanstack/react-query';
import {
  EmailTemplateType,
  useEmailTemplatesServiceEmailTemplateControllerGetTranslations,
  useEmailTemplatesServiceEmailTemplateControllerSetTranslations,
  useEmailTemplatesServiceEmailTemplateControllerDeleteTranslations,
  UseEmailTemplatesServiceEmailTemplateControllerGetTranslationsKeyFn,
} from '@attraccess/react-query-client';

export function useTemplateTranslations(templateType: EmailTemplateType | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: UseEmailTemplatesServiceEmailTemplateControllerGetTranslationsKeyFn({ type: templateType as EmailTemplateType }),
    });

  const query = useEmailTemplatesServiceEmailTemplateControllerGetTranslations(
    { type: templateType as EmailTemplateType },
    undefined,
    { enabled: !!templateType },
  );

  const saveMutation = useEmailTemplatesServiceEmailTemplateControllerSetTranslations({
    onSuccess: invalidate,
  });

  const deleteMutation = useEmailTemplatesServiceEmailTemplateControllerDeleteTranslations({
    onSuccess: invalidate,
  });

  return { query, saveMutation, deleteMutation };
}
