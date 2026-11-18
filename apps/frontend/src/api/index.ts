import { client } from '@attraccess/react-query-client';
import { detectPreferredLanguage, useTranslationState } from '@attraccess/plugins-frontend-ui';

function normalizeUrl<TUrl extends string | undefined>(url: TUrl): TUrl {
  if (typeof url !== 'string') {
    return undefined as TUrl;
  }

  let normalizedUrl: string = url;
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = `http://${normalizedUrl}`;
  }

  const parsedUrl = new URL(normalizedUrl);

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

// Request interceptors survive setConfig(), so configuring twice must not register a second one.
let acceptLanguageInterceptor: number | undefined;

export function configureApiClient() {
  // Session cookies authenticate every request.
  client.setConfig({ baseUrl: getBaseUrl(), credentials: 'include' });
  if (acceptLanguageInterceptor !== undefined) return;
  acceptLanguageInterceptor = client.interceptors.request.use((request) => {
    // Registration stores this header as a personal preference. A displayed
    // system fallback must stay undetermined so future defaults still apply.
    const registration = request.method === 'POST' && new URL(request.url).pathname === '/api/users';
    request.headers.set(
      'Accept-Language',
      registration ? (detectPreferredLanguage() ?? 'und') : useTranslationState.getState().language,
    );
    return request;
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
