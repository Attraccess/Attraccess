import { HTMLAttributes } from 'react';
import { AutoScaleOptions } from './imageProcessing';

export interface ImageUploadProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  id: string;
  label: string;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  currentImageUrl?: string;
  /** When provided, input images are resized/compressed in-browser before upload */
  autoScale?: AutoScaleOptions;
}
