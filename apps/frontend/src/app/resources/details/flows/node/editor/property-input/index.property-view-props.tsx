import { Props } from './index.props';

export interface PropertyViewProps<TValue> extends Props<TValue> {
  label: string;
  description: React.ReactNode;
}
