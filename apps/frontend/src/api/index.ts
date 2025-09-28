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

function getInferredApiUrl() {
  return normalizeUrl(window.location.href);
}

function getEnvApiUrl() {
  if (!import.meta.env.ATTRACCESS_URL) {
    return undefined;
  }

  return normalizeUrl(import.meta.env.ATTRACCESS_URL as string | undefined);
}

export function getBaseUrl() {
  return getEnvApiUrl() || getInferredApiUrl();
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
