import { HTMLAttributes } from 'react';
import { ApiKeyCard } from './apiKey';
import { CurrencyCard } from './currency';
import { cn } from '@heroui/react';

export function SumUpConfigurationCard(props: Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <div {...props} className={cn('flex flex-col gap-4', props.className)}>
      <ApiKeyCard className="flex-grow" />
      <CurrencyCard className="flex-grow" />
    </div>
  );
}
