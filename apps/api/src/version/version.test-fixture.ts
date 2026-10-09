import { GithubReleaseApiResponse } from './version.service';
export function buildRelease(overrides: Partial<GithubReleaseApiResponse> = {}): GithubReleaseApiResponse {
  return {
    tag_name: 'v1.0.0',
    name: 'Release 1.0.0',
    body: 'Notes',
    html_url: 'https://github.com/Attraccess/Attraccess/releases/tag/v1.0.0',
    published_at: '2026-01-01T00:00:00Z',
    draft: false,
    prerelease: false,
    ...overrides,
  };
}
export function makeRepo(countValue = 0) {
  return { count: jest.fn().mockResolvedValue(countValue) };
}
