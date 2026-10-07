import { type Cc100HardwareProfile } from '../shared/hardware-profile';
export type RuntimeDeliveryBundle = {
  directory: string;
  path: string;
  bytes: number;
  digest: string;
  image: string;
  imageId?: string;
  hardwareProfile?: Cc100HardwareProfile;
};
