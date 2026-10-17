import { ResourceIntroduction } from './resourceIntroduction';
import { ResourceIntroducer } from './resourceIntroducer';
import { Resource } from './resource';

export interface ResourceGroup {
  id: number;
  name: string;
  description: string | null;
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
  introductions: ResourceIntroduction[];
  introducers: ResourceIntroducer[];
  resources: Resource[];
}
