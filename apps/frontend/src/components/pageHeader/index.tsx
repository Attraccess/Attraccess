import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@heroui/button';
import { cn, Image } from '@heroui/react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  noMargin?: boolean;
  thumbnailSrc?: string;
  thumbnailAlt?: string;
}

export function PageHeader({
  title,
  subtitle,
  backTo,
  actions,
  icon,
  noMargin,
  thumbnailSrc,
  thumbnailAlt,
}: Readonly<PageHeaderProps>) {
  const navigate = useNavigate();

  return (
    <div className={cn('flex items-center justify-between mb-8 flex-wrap gap-y-8', noMargin && 'mb-0')}>
      <div className="flex items-center">
        {backTo && (
          <Button
            onPress={() => navigate(backTo)}
            variant="ghost"
            isIconOnly
            aria-label="Go back"
            className="mr-4"
            data-cy="back-button"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
        )}

        <div className="flex-shrink">
          <div className="flex items-center gap-2">
            {icon}
            {thumbnailSrc && (
              <Image
                classNames={{
                  img: 'object-contain',
                }}
                height={48}
                width={48}
                isBlurred
                src={thumbnailSrc}
                alt={thumbnailAlt}
              />
            )}
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
          {subtitle && <p className="mt-1 text-sm text-foreground-500">{subtitle}</p>}
        </div>
      </div>

      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
