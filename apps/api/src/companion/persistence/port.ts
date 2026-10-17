import type { CompanionDevice, ResourceFlowNode } from '@attraccess/application-models';

export abstract class CompanionPersistence {
  abstract register(name: string, tokenHash: string): Promise<CompanionDevice>;
  abstract findById(id: number): Promise<CompanionDevice | null>;
  abstract touchConnection(id: number, at: Date, appVersion?: string): Promise<void>;
  abstract listDevices(): Promise<CompanionDevice[]>;
  abstract rename(id: number, name: string): Promise<CompanionDevice>;
  abstract remove(id: number): Promise<void>;
  abstract setLocked(id: number, locked: boolean): Promise<void>;
  abstract lockCommandNodes(): Promise<ResourceFlowNode[]>;
}
