export /** Mirrors the API's `@IsUrl()`: a full absolute URL, scheme included. */
const isAbsoluteUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};
