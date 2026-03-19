import React from 'react';
import { Card, CardBody } from '@heroui/react';
import { Info } from 'lucide-react';

interface InfoCardData {
  type: 'info-card';
  title: string;
  description: string;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'default';
}

const COLOR_MAP: Record<string, string> = {
  primary: 'border-primary-200 bg-primary-50 dark:bg-primary-900/20',
  success: 'border-success-200 bg-success-50 dark:bg-success-900/20',
  warning: 'border-warning-200 bg-warning-50 dark:bg-warning-900/20',
  danger: 'border-danger-200 bg-danger-50 dark:bg-danger-900/20',
  default: 'border-default-200 bg-default-50',
};

export function InfoCard({ data }: { data: InfoCardData }) {
  const className = COLOR_MAP[data.color || 'primary'] || COLOR_MAP['primary'];

  return (
    <Card className={`my-2 border ${className}`} shadow="none" radius="lg">
      <CardBody className="px-3 py-2">
        <div className="flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-default-500" />
          <div>
            <p className="text-xs font-semibold">{data.title}</p>
            <p className="text-xs text-default-600">{data.description}</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function isInfoCard(data: unknown): data is InfoCardData {
  const d = data as Record<string, unknown>;
  return d?.type === 'info-card' && typeof d?.title === 'string';
}
