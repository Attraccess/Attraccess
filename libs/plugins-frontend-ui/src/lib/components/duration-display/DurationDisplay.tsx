import React from 'react';
import { useFormatedDuration } from '../../hooks/useFormatDuration';

interface DurationDisplayProps {
  minutes: number | null;
  alternativeText?: React.ReactNode;
}

/**
 * Component to display a duration as hh:mm:ss, rounded to the nearest second.
 */
export function DurationDisplay({
  minutes,
  alternativeText = '',
  ...spanProps
}: DurationDisplayProps & React.HTMLAttributes<HTMLSpanElement>) {
  const formatedDuration = useFormatedDuration(minutes ?? 0);

  if (minutes === null || minutes === undefined) {
    return <span {...spanProps}>{alternativeText}</span>;
  }

  return <span {...spanProps}>{formatedDuration}</span>;
}
