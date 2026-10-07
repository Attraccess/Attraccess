import { ApiError } from '@attraccess/react-query-client';
export type CsvRowError = {
  row: number;
  field?: string;
  message: string;
  value?: string;
};

export interface Props {
  onSuccess?: () => void;
  onError?: (error: ApiError) => void;
}
