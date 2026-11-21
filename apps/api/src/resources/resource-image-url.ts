import { CDN_SERVE_ROOT } from '../config/storage.config';

/** Public URL of a resource image; the same path ResourceImageService stores the file under (`resources/<id>/original`). */
export function resourceImageUrl(resourceId: number, filename: string | null | undefined): string | null {
  return filename ? `${CDN_SERVE_ROOT}/resources/${resourceId}/original/${filename}` : null;
}
