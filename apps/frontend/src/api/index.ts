import { OpenAPI } from '@attraccess/react-query-client';
import { detectPreferredLanguage, useTranslationState } from '@attraccess/plugins-frontend-ui';

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
  OpenAPI.HEADERS = async (options) => ({
    // Registration stores this header as a personal preference. A displayed
    // system fallback must stay undetermined so future defaults still apply.
    'Accept-Language':
      options.method === 'POST' && options.url === '/api/users'
        ? (detectPreferredLanguage() ?? 'und')
        : useTranslationState.getState().language,
  });
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
