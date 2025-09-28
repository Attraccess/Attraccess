function normalizeUrl(url: string) {
  if (!url) {
    return undefined;
  }

  if (!url.startsWith('http')) {
    url = `http://${url}`;
  }

  const parsedUrl = new URL(url);

  if (!parsedUrl.protocol) {
    parsedUrl.protocol = 'http:';
  }

  let port = '';
  if (parsedUrl.port) {
    port = `:${parsedUrl.port}`;
  }

  console.log('url', {
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port,
  });

  return `${parsedUrl.protocol}//${parsedUrl.hostname}${port}`;
}

function getInferredApiUrl() {
  return normalizeUrl(window.location.href);
}

function getEnvApiUrl() {
  if (!import.meta.env.ATTRACCESS_URL) {
    return undefined;
  }

  return normalizeUrl(import.meta.env.ATTRACCESS_URL);
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
