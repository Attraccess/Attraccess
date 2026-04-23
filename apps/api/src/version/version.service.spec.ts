import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GithubReleaseApiResponse, VersionService } from './version.service';

jest.mock('axios');

const axiosMock = axios as jest.Mocked<typeof axios>;

function buildRelease(overrides: Partial<GithubReleaseApiResponse> = {}): GithubReleaseApiResponse {
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

describe('VersionService', () => {
  let service: VersionService;
  let configService: { get: jest.Mock };
  let httpGet: jest.Mock;

  beforeEach(async () => {
    httpGet = jest.fn();
    axiosMock.create.mockReturnValue({ get: httpGet } as unknown as ReturnType<typeof axios.create>);

    configService = { get: jest.fn().mockReturnValue({ VERSION: '0.0.16' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VersionService, { provide: ConfigService, useValue: configService }],
    }).compile();

    service = module.get<VersionService>(VersionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentVersion', () => {
    it('returns the version from app config', () => {
      expect(service.getCurrentVersion()).toEqual({ version: '0.0.16' });
    });

    it('normalizes a "v"-prefixed version', () => {
      configService.get.mockReturnValue({ VERSION: 'v1.2.3' });
      expect(service.getCurrentVersion()).toEqual({ version: '1.2.3' });
    });

    it('falls back to 1.0.0 when config is missing', () => {
      configService.get.mockReturnValue(undefined);
      expect(service.getCurrentVersion()).toEqual({ version: '1.0.0' });
    });

    it('keeps the raw value when the configured version is not semver-shaped', () => {
      configService.get.mockReturnValue({ VERSION: 'canary' });
      expect(service.getCurrentVersion()).toEqual({ version: 'canary' });
    });
  });

  describe('getUpdateStatus', () => {
    it('reports an available update when GitHub has a newer stable release', async () => {
      httpGet.mockResolvedValue({ data: [buildRelease({ tag_name: 'v0.1.2' })] });

      const result = await service.getUpdateStatus();

      expect(result.currentVersion).toBe('0.0.16');
      expect(result.latestVersion).toBe('0.1.2');
      expect(result.isUpdateAvailable).toBe(true);
      expect(result.checkSucceeded).toBe(true);
      expect(result.latestRelease).toMatchObject({
        version: '0.1.2',
        tagName: 'v0.1.2',
        htmlUrl: 'https://github.com/Attraccess/Attraccess/releases/tag/v1.0.0',
      });
    });

    it('reports no update when the running version equals the latest release', async () => {
      configService.get.mockReturnValue({ VERSION: '1.0.0' });
      httpGet.mockResolvedValue({ data: [buildRelease({ tag_name: 'v1.0.0' })] });

      const result = await service.getUpdateStatus();

      expect(result.isUpdateAvailable).toBe(false);
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('reports no update when the running version is newer than the highest release', async () => {
      configService.get.mockReturnValue({ VERSION: '2.0.0' });
      httpGet.mockResolvedValue({ data: [buildRelease({ tag_name: 'v1.0.0' })] });

      const result = await service.getUpdateStatus();

      expect(result.isUpdateAvailable).toBe(false);
    });

    it('picks the highest stable release, ignoring drafts and prereleases', async () => {
      httpGet.mockResolvedValue({
        data: [
          buildRelease({ tag_name: 'v0.2.0', draft: true }),
          buildRelease({ tag_name: 'v0.2.0-beta.1', prerelease: true }),
          buildRelease({ tag_name: 'v0.1.5' }),
          buildRelease({ tag_name: 'v0.1.9' }),
          buildRelease({ tag_name: 'v0.1.7' }),
        ],
      });

      const result = await service.getUpdateStatus();

      expect(result.latestVersion).toBe('0.1.9');
    });

    it('skips releases with non-semver tags', async () => {
      httpGet.mockResolvedValue({
        data: [
          buildRelease({ tag_name: 'latest' }),
          buildRelease({ tag_name: 'nightly-2026-04-20' }),
          buildRelease({ tag_name: 'v0.0.17' }),
        ],
      });

      const result = await service.getUpdateStatus();

      expect(result.latestVersion).toBe('0.0.17');
      expect(result.isUpdateAvailable).toBe(true);
    });

    it('returns checkSucceeded=true with no release when GitHub has no stable releases', async () => {
      httpGet.mockResolvedValue({
        data: [buildRelease({ tag_name: 'v0.1.0', draft: true })],
      });

      const result = await service.getUpdateStatus();

      expect(result.checkSucceeded).toBe(true);
      expect(result.latestVersion).toBeNull();
      expect(result.latestRelease).toBeNull();
      expect(result.isUpdateAvailable).toBe(false);
    });

    it('returns checkSucceeded=true when GitHub responds with an empty list', async () => {
      httpGet.mockResolvedValue({ data: [] });

      const result = await service.getUpdateStatus();

      expect(result.checkSucceeded).toBe(true);
      expect(result.latestRelease).toBeNull();
      expect(result.isUpdateAvailable).toBe(false);
    });

    it('returns checkSucceeded=false when the GitHub request fails', async () => {
      httpGet.mockRejectedValue(new Error('network error'));

      const result = await service.getUpdateStatus();

      expect(result.checkSucceeded).toBe(false);
      expect(result.latestVersion).toBeNull();
      expect(result.isUpdateAvailable).toBe(false);
      expect(result.currentVersion).toBe('0.0.16');
    });

    it('handles non-array responses defensively', async () => {
      httpGet.mockResolvedValue({ data: { unexpected: true } });

      const result = await service.getUpdateStatus();

      expect(result.checkSucceeded).toBe(true);
      expect(result.latestRelease).toBeNull();
    });

    it('normalizes release fields with safe defaults when GitHub omits them', async () => {
      httpGet.mockResolvedValue({
        data: [buildRelease({ tag_name: 'v0.1.2', name: null, body: null, published_at: null })],
      });

      const result = await service.getUpdateStatus();

      expect(result.latestRelease).toMatchObject({
        name: 'v0.1.2',
        body: '',
        publishedAt: '',
      });
    });

    it('caches successful results for repeated calls', async () => {
      httpGet.mockResolvedValue({ data: [buildRelease({ tag_name: 'v0.1.2' })] });

      await service.getUpdateStatus();
      await service.getUpdateStatus();
      await service.getUpdateStatus();

      expect(httpGet).toHaveBeenCalledTimes(1);
    });

    it('refetches when forceRefresh is true', async () => {
      httpGet.mockResolvedValue({ data: [buildRelease({ tag_name: 'v0.1.2' })] });

      await service.getUpdateStatus();
      await service.getUpdateStatus(true);

      expect(httpGet).toHaveBeenCalledTimes(2);
    });

    it('does not cache failures - a retry hits GitHub again', async () => {
      httpGet.mockRejectedValueOnce(new Error('boom'));
      httpGet.mockResolvedValueOnce({ data: [buildRelease({ tag_name: 'v0.1.2' })] });

      const firstResult = await service.getUpdateStatus();
      expect(firstResult.checkSucceeded).toBe(false);

      const secondResult = await service.getUpdateStatus();
      expect(secondResult.checkSucceeded).toBe(true);
      expect(secondResult.latestVersion).toBe('0.1.2');
      expect(httpGet).toHaveBeenCalledTimes(2);
    });

    it('clearCache forces a refetch on the next call', async () => {
      httpGet.mockResolvedValue({ data: [buildRelease({ tag_name: 'v0.1.2' })] });

      await service.getUpdateStatus();
      service.clearCache();
      await service.getUpdateStatus();

      expect(httpGet).toHaveBeenCalledTimes(2);
    });

    it('sends the expected GitHub API headers', () => {
      const createArgs = axiosMock.create.mock.calls[0]?.[0];
      expect(createArgs?.headers).toMatchObject({
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      });
    });
  });
});
