import { parseFormImageIds } from '@attraccess/application-models';
import { FormImageThumbnail } from './FormImageThumbnail';

interface FormImageAnswerProps {
  /** The stored answer: the JSON list of image ids. */
  value: unknown;
  /** The name of the field, for the accessible names of the photos. */
  fieldName?: string;
}

/** The answer of an image field: thumbnails that open full size. Never the raw ids. */
export function FormImageAnswer({ value, fieldName }: Readonly<FormImageAnswerProps>) {
  const ids = parseFormImageIds(value);
  if (!ids.length) return <span>–</span>;
  return (
    <div className="flex flex-wrap gap-2" data-cy="form-image-answer">
      {ids.map((id, index) => (
        <FormImageThumbnail key={id} imageId={id} number={index + 1} total={ids.length} fieldName={fieldName} />
      ))}
    </div>
  );
}
