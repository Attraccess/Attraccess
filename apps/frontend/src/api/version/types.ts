export interface VersionInfo {
  version: string;
}

export interface Release {
  version: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  isUpdateAvailable: boolean;
  checkSucceeded: boolean;
  latestRelease: Release | null;
}
