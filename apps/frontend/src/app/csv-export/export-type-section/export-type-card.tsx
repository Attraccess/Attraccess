// Presentational card for one CSV export type with row count and CTA
// FEATURE: CSV export — step 2 of new export flow
import { Button, Card, Chip, Spinner } from '@heroui/react';
import { ArrowRightIcon, LucideIcon } from 'lucide-react';
import { QueryStatus } from '@tanstack/react-query';

interface Props {
  Icon: LucideIcon;
  title: string;
  description: string;
  rowCount?: number;
  rowCountStatus: QueryStatus | 'idle';
  estimatedLabel: (vars: { count: number }) => string;
  loadingLabel: string;
  ctaLabel: string;
  requireRangeLabel: string;
  isDisabled: boolean;
  onPress: () => void;
  dataCy: string;
}

export function ExportTypeCard(props: Props) {
  const {
    Icon,
    title,
    description,
    rowCount,
    rowCountStatus,
    estimatedLabel,
    loadingLabel,
    ctaLabel,
    requireRangeLabel,
    isDisabled,
    onPress,
    dataCy,
  } = props;

  return (
    <Card
      className={
        'transition-all flex flex-col h-full ' +
        (isDisabled
          ? 'opacity-60 pointer-events-none'
          : 'hover:border-accent hover:-translate-y-0.5 hover:shadow-lg cursor-pointer')
      }
      data-cy={dataCy + '-card'}
    >
      <Card.Header>
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center size-10 rounded-lg bg-accent-soft text-accent-soft-foreground shrink-0">
            <Icon className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <Card.Title className="text-base">{title}</Card.Title>
            <Card.Description className="text-xs">{description}</Card.Description>
          </div>
        </div>
      </Card.Header>
      <Card.Content className="flex items-center justify-between gap-2 mt-auto">
        {isDisabled ? (
          <Chip variant="soft" color="default" size="sm">
            {requireRangeLabel}
          </Chip>
        ) : rowCountStatus === 'pending' ? (
          <Chip variant="soft" color="default" size="sm">
            <Spinner size="sm" />
            {loadingLabel}
          </Chip>
        ) : rowCountStatus === 'error' ? (
          <Chip variant="soft" color="danger" size="sm">
            {estimatedLabel({ count: 0 })}
          </Chip>
        ) : (
          <Chip variant="soft" color={rowCount && rowCount > 0 ? 'accent' : 'default'} size="sm">
            {estimatedLabel({ count: rowCount ?? 0 })}
          </Chip>
        )}
      </Card.Content>
      <Card.Footer>
        <Button
          variant="primary"
          fullWidth
          isDisabled={isDisabled}
          onPress={onPress}
          data-cy={dataCy + '-button'}
        >
          {ctaLabel}
          <ArrowRightIcon className="size-4" />
        </Button>
      </Card.Footer>
    </Card>
  );
}
