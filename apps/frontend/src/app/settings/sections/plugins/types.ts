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
