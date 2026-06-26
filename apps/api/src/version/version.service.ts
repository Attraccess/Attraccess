import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull, MoreThan } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import * as semver from 'semver';
import { User, Resource, Project, ResourceUsage, Session } from '@attraccess/database-entities';
import { UPDATE_CHECK_CACHE_TTL_MS } from '@attraccess/shared';
import { AppConfigType } from '../config/app.config';
import { ReleaseDto } from './dto/release.dto';
import { SystemInfoDto } from './dto/system-info.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { VersionInfoDto } from './dto/version-info.dto';

export interface GithubReleaseApiResponse {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
}

export const GITHUB_RELEASES_URL = 'https://api.github.com/repos/Attraccess/Attraccess/releases';
export const GITHUB_REQUEST_TIMEOUT_MS = 10 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: UpdateStatusDto;
}

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly http: AxiosInstance;
  private cache: CacheEntry | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Resource) private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
    @InjectRepository(ResourceUsage) private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(Session) private readonly sessionRepository: Repository<Session>,
  ) {
    this.http = axios.create({
      timeout: GITHUB_REQUEST_TIMEOUT_MS,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Attraccess-UpdateChecker',
      },
    });
  }

  getCurrentVersion(): VersionInfoDto {
    const appConfig = this.configService.get<AppConfigType>('app');
    const raw = appConfig?.VERSION ?? '0.0.0-dev';
    const normalized = semver.valid(semver.clean(raw)) ?? raw;
    const commitHash = appConfig?.COMMIT_SHA ?? null;
    return { version: normalized, commitHash };
  }

  async getSystemInfo(): Promise<SystemInfoDto> {
    const [usersTotal, resourcesTotal, projectsTotal, activeResourceUsageSessions, activeAuthSessions] =
      await Promise.all([
        this.userRepository.count(),
        this.resourceRepository.count(),
        this.projectRepository.count(),
        this.resourceUsageRepository.count({ where: { endTime: IsNull() } }),
        this.sessionRepository.count({ where: { expiresAt: MoreThan(new Date()) } }),
      ]);

    return {
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      usersTotal,
      resourcesTotal,
      projectsTotal,
      activeResourceUsageSessions,
      activeAuthSessions,
    };
  }

  async getUpdateStatus(forceRefresh = false): Promise<UpdateStatusDto> {
    const now = Date.now();
    if (!forceRefresh && this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const { version: currentVersion } = this.getCurrentVersion();

    let releases: GithubReleaseApiResponse[] = [];
    try {
      const response = await this.http.get<GithubReleaseApiResponse[]>(GITHUB_RELEASES_URL, {
        params: { per_page: 30 },
      });
      releases = Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to fetch GitHub releases for update check: ${message}`);
      return {
        currentVersion,
        latestVersion: null,
        isUpdateAvailable: false,
        checkSucceeded: false,
        latestRelease: null,
      };
    }

    const latestRelease = this.pickLatestRelease(releases);
    if (!latestRelease) {
      const value: UpdateStatusDto = {
        currentVersion,
        latestVersion: null,
        isUpdateAvailable: false,
        checkSucceeded: true,
        latestRelease: null,
      };
      this.cache = { expiresAt: now + UPDATE_CHECK_CACHE_TTL_MS, value };
      return value;
    }

    const latestVersion = semver.valid(semver.clean(latestRelease.tag_name));
    const isUpdateAvailable =
      latestVersion !== null && semver.valid(currentVersion) !== null
        ? semver.gt(latestVersion, currentVersion)
        : false;

    const releaseDto: ReleaseDto = {
      version: latestVersion ?? latestRelease.tag_name,
      tagName: latestRelease.tag_name,
      name: latestRelease.name ?? latestRelease.tag_name,
      body: latestRelease.body ?? '',
      htmlUrl: latestRelease.html_url,
      publishedAt: latestRelease.published_at ?? '',
    };

    const value: UpdateStatusDto = {
      currentVersion,
      latestVersion,
      isUpdateAvailable,
      checkSucceeded: true,
      latestRelease: releaseDto,
    };
    this.cache = { expiresAt: now + UPDATE_CHECK_CACHE_TTL_MS, value };
    return value;
  }

  clearCache(): void {
    this.cache = null;
  }

  private pickLatestRelease(releases: GithubReleaseApiResponse[]): GithubReleaseApiResponse | null {
    const stable = releases
      .filter((release) => !release.draft && !release.prerelease)
      .filter((release) => semver.valid(semver.clean(release.tag_name)) !== null);

    if (stable.length === 0) {
      return null;
    }

    return stable.reduce((highest, candidate) => {
      const highestNormalized = semver.valid(semver.clean(highest.tag_name));
      const candidateNormalized = semver.valid(semver.clean(candidate.tag_name));
      if (!candidateNormalized) return highest;
      if (!highestNormalized) return candidate;
      return semver.gt(candidateNormalized, highestNormalized) ? candidate : highest;
    });
  }
}
