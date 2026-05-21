import { HTMLAttributes } from 'react';
import { ApiKeyCard } from './apiKey';
import { CurrencyCard } from './currency';
import { cn } from '@heroui/react';

export function SumUpConfigurationCard(props: Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  return (
    <div {...props} className={cn('@container w-full', props.className)}>
      <div className="flex flex-col @xl:flex-row gap-4 @xl:gap-6 @xl:items-stretch">
        <ApiKeyCard className="flex-1" />
        <CurrencyCard className="flex-1" />
      </div>
    </div>
  );
}
