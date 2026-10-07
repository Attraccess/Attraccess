export abstract class IotToFlow1752005121356RouteContext {
  protected abstract generateNodeId(): string;
  protected abstract transformTemplate(template: string): string;
  protected abstract generateEdgeId(): string;
  protected abstract transformWebhookHeaders(headers: Record<string, string>): Record<string, string>;
}
