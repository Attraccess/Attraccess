export class Strategy {}
export class MultiSamlStrategy {
  constructor(readonly _options: Record<string, unknown>) {}
}
export type Profile = Record<string, unknown>;
export type PassportSamlConfig = Record<string, unknown>;
