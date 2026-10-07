export // Freeze nested maps: callers must duplicate before editing. Evidence URLs are documented in README.
function freeze(value: object): void {
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') freeze(child);
  });
  Object.freeze(value);
}
