import { CircularProgress } from '@heroui/react';

export const TableDataLoadingIndicator = () => {
  return (
    <div className="flex justify-center items-center p-4">
      <CircularProgress isIndeterminate />
    </div>
  );
};
