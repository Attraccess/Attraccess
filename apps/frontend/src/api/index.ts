import { OpenAPI } from '@attraccess/react-query-client';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

function normalizeUrl<TUrl extends string | undefined>(url: TUrl): TUrl {
  if (typeof url !== 'string') {
    return undefined as TUrl;
  }

  let normalizedUrl: string = url;
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = `http://${normalizedUrl}`;
  }

  const parsedUrl = new URL(url);

  if (!parsedUrl.protocol) {
    parsedUrl.protocol = 'http:';
  }

  let port = '';
  if (parsedUrl.port) {
    port = `:${parsedUrl.port}`;
  }

  return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}` as TUrl;
}

export function getBaseUrl() {
  return normalizeUrl(window.location.href);
}

export function configureApiClient() {
  OpenAPI.BASE = getBaseUrl();
  OpenAPI.ENCODE_PATH = encodeURIComponent;
  // Registration and other translated responses must use the displayed language,
  // including a system default that differs from the browser's language.
  OpenAPI.HEADERS = async () => ({ 'Accept-Language': useTranslationState.getState().language });
}

export function filenameToUrl(name?: string) {
  if (!name) {
    return undefined;
  }

  if (name.startsWith('http')) {
    return name;
  }

  if (name.startsWith('/')) {
    return `${getBaseUrl()}${name}`;
  }

  return `${getBaseUrl()}/${name}`;
}
