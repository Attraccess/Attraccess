export function formatActivity(event: string): string {
  return event.replace(/^progress: /, '').replaceAll('_', ' ');
}
