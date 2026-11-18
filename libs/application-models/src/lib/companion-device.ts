/** A resource reference as it is listed on a companion device. Extra resource fields are carried through unchanged. */
export interface CompanionDeviceResource {
  id: number;
  name: string;
  [field: string]: unknown;
}

/** A registered companion device (a desktop app that locks/unlocks a PC for a machine). */
export interface CompanionDeviceRecord {
  id: number;
  name: string;
  /** Hash of the device token. Never returned to API clients. */
  tokenHash: string;
  resources: CompanionDeviceResource[];
  locked: boolean;
  lastConnection: Date;
  firstConnection: Date;
  appVersion: string | null;
}

/** The resources a companion device controls through a flow node. */
export interface CompanionControlledResource {
  id: number;
  name: string;
}
