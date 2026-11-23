import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MAX_FILE_SIZE } from '../../../components/imageUpload';
import type { ImageUploadProblem } from './imageUploadProblem';
import en from './en.json';
import de from './de.json';

interface ImageFieldErrorProps {
  /** A message of the surrounding form (e.g. a required field); shown instead of the upload problem. */
  error?: string | null;
  problem: ImageUploadProblem | null;
  maxImages: number;
}

/** The error line under an image field: why the field is invalid, or why the last photo was not added. */
export function ImageFieldError({ error, problem, maxImages }: Readonly<ImageFieldErrorProps>) {
  const { t } = useTranslations({ en, de });
  const message = error ?? (problem ? describe(problem) : null);
  if (!message) return null;
  return (
    <p className="flex items-start gap-1 text-sm font-medium text-danger" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  );

  function describe(current: ImageUploadProblem): string {
    switch (current.kind) {
      case 'max':
        return t('maxReached', { count: maxImages });
      case 'type':
        return t('typeError');
      case 'size':
        return t('sizeError', { maxSize: MAX_FILE_SIZE / 1024 / 1024 });
      case 'rateLimited':
        return t('rateLimited');
      case 'rejected':
        return current.message;
      default:
        return t('uploadError');
    }
  }
}
