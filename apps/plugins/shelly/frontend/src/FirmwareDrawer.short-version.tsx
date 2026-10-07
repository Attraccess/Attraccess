export /**
 * Gen1 reports versions as `20230913-114150/v1.14.0` — only the tail is useful
 * at a glance, the full string stays in the tooltip.
 */
function shortVersion(version: string): string {
  const tail = version.split('/').pop();
  return tail && tail.length > 0 ? tail : version;
}
