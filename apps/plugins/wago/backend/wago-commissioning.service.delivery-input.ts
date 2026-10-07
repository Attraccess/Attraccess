import type { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";

export type DeliveryInput = { temporarySsh?: TemporarySshCredential; confirmInstall?: boolean };
