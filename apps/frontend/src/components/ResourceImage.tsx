import { ShapesIcon } from 'lucide-react';
import { filenameToUrl } from '../api';

interface ResourceImageProps {
  imageFilename?: string | null;
  name: string;
  /** Tailwind classes applied to both the img and the placeholder wrapper div */
  className?: string;
  /** Tailwind classes applied to the placeholder ShapesIcon */
  iconClassName?: string;
}

export function ResourceImage({ imageFilename, name, className = 'w-12 h-12', iconClassName = 'w-6 h-6' }: ResourceImageProps) {
  if (imageFilename) {
    return (
      <img
        src={filenameToUrl(imageFilename)}
        alt={name}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <div className={`${className} bg-default-200 flex items-center justify-center`}>
      <ShapesIcon className={`${iconClassName} text-default-500`} />
    </div>
  );
}
