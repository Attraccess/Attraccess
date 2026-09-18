export function npmDistTag(version) {
  const prerelease = version.match(/-([0-9A-Za-z-]+)(?:\.|$)/)?.[1];
  if (!prerelease) return 'latest';
  return /^\d+$/.test(prerelease) ? 'next' : prerelease;
}
