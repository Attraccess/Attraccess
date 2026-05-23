import React from 'react';
import { Spinner } from '@heroui/react';

export function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <Spinner color="accent" data-cy="loading-spinner" />
        <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">
          Loading...
        </div>
      </div>
    </div>
  );
}
