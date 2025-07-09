export interface Firmware {
  environment: string;
  friendly_name?: string;
  version: `${number}.${number}.${number}-${number}`;
  board_family?: string;
  manifest_path: string;
}
