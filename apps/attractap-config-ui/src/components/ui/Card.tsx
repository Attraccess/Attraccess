import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: Readonly<CardProps>) {
  return (
    <div
      className={cn(
        'bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export function CardHeader({ className, children }: Readonly<CardHeaderProps>) {
  return (
    <div
      className={cn(
        'p-4 sm:p-5 flex items-center justify-between border-b border-gray-200 dark:border-gray-700',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardTitleProps {
  className?: string;
  children: React.ReactNode;
}

export function CardTitle({ className, children }: Readonly<CardTitleProps>) {
  return <h3 className={cn('text-lg font-semibold text-gray-900 dark:text-gray-100', className)}>{children}</h3>;
}

interface CardContentProps {
  className?: string;
  children: React.ReactNode;
}

export function CardContent({ className, children }: Readonly<CardContentProps>) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>;
}

interface CardFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function CardFooter({ className, children }: Readonly<CardFooterProps>) {
  return <div className={cn('p-4 sm:p-5 border-t border-gray-200 dark:border-gray-700', className)}>{children}</div>;
}
