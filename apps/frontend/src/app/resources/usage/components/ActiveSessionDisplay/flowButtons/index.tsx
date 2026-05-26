import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  useResourceFlowsServiceGetButtons,
  useResourceFlowsServicePressButton,
} from '@attraccess/react-query-client';
import { Button } from '../../../../../../components/button';
import { useState } from 'react';
import API_ERROR_TRANSLATIONS_DE from '../../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../../global-translations/api-errors.en.json';
import { useToastMessage } from '../../../../../../components/toastProvider';

interface Props {
  resourceId: number;
}

export function FlowButtons(props: Props) {
  const { resourceId } = props;

  const { t, tExists } = useTranslations({
    de: {
      api: API_ERROR_TRANSLATIONS_DE,
    },
    en: {
      api: API_ERROR_TRANSLATIONS_EN,
    },
  });

  const toast = useToastMessage();

  const { data: buttons } = useResourceFlowsServiceGetButtons({ resourceId });
  const [pendingButtons, setPendingButtons] = useState<string[]>([]);
  const { mutate: pressButton } = useResourceFlowsServicePressButton({
    onMutate(variables) {
      setPendingButtons((prev) => [...prev, variables.buttonId]);
    },
    onSuccess(_data, variables, _context) {
      setPendingButtons((prev) => prev.filter((id) => id !== variables.buttonId));
    },
    onError(_error, variables, _context) {
      setPendingButtons((prev) => prev.filter((id) => id !== variables.buttonId));
      toast.apiError({
        error: _error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  if (buttons?.length === 0) {
    return null;
  }

  return (
    <div className="grid w-full gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(12rem,100%),1fr))]">
      {buttons?.map((node) => (
        <Button
          key={node.id}
          onPress={() => {
            pressButton({ resourceId, buttonId: node.id });
          }}
          isPending={pendingButtons.includes(node.id)}
          className="w-full min-w-0 max-w-full"
        >
          <span className="block whitespace-normal break-words text-center">
            {(node.data as { label: string }).label ?? node.id}
          </span>
        </Button>
      ))}
    </div>
  );
}
