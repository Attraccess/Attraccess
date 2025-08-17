import { useResourceFlowsServiceGetButtons, useResourceFlowsServicePressButton } from '@attraccess/react-query-client';
import { Button } from '@heroui/react';
import { useState } from 'react';

interface Props {
  resourceId: number;
}

export function FlowButtons(props: Props) {
  const { resourceId } = props;

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
          isLoading={pendingButtons.includes(node.id)}
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
