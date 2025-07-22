function getInferredApiUrl() {
  const frontendUrl = new URL(window.location.href);

  let port = '';
  if (frontendUrl.port) {
    port = `:${frontendUrl.port}`;
  }

  return `${frontendUrl.protocol}//${frontendUrl.hostname}${port}`;
}

export function getBaseUrl() {
  return import.meta.env.ATTRACCESS_URL || getInferredApiUrl();
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
