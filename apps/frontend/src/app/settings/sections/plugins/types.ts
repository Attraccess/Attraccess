/** The installed package a version dialog is opened for. */
export interface VersionPlugin {
  name: string;
  version: string;
}

/** A plugin whose backend failed to load, shown in the load-error dialog. */
export interface FailedPlugin {
  id: string;
  name: string;
  error: string;
}

/** Identifies a marketplace package whose detail page should be opened. */
export interface MarketplaceDetailRequest {
  name: string;
  registryId: string;
}

/**
 * The registry form and its pending requests. It lives with the marketplace browser so that it survives showing a
 * package's details and closing the marketplace, which unmount the registry management.
 */
export interface RegistryForm {
  name: string;
  url: string;
  token: string;
  isSaving: boolean;
  /** The latest registry test still running; an earlier test settling does not end it. */
  test: { registryId: string; request: symbol } | null;
}
