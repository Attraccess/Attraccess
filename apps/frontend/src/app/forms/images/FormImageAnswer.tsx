import { parseFormImageIds } from '@attraccess/application-models';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormImageThumbnail } from './FormImageThumbnail';
import en from './en.json';
import de from './de.json';

interface FormImageAnswerProps {
  /** The stored answer: the JSON list of image ids. */
  value: unknown;
  /** Only a count ("3 photos") instead of thumbnails, where space is tight. */
  compact?: boolean;
}

/** The answer of an image field: thumbnails that open full size, or a count. Never the raw ids. */
export function FormImageAnswer({ value, compact = false }: Readonly<FormImageAnswerProps>) {
  const { t } = useTranslations({ en, de });
  const ids = parseFormImageIds(value);
  if (!ids.length) return <span>–</span>;
  if (compact) return <span>{ids.length === 1 ? t('photo') : t('photos', { count: ids.length })}</span>;
  return (
    <div className="flex flex-wrap gap-2" data-cy="form-image-answer">
      {ids.map((id, index) => (
        <FormImageThumbnail key={id} imageId={id} number={index + 1} />
      ))}
    </div>
  );
}
