/**
 * A break between groups of rows. Four concerns share one section, and without a marker the
 * password-policy switches read as more login-throttling switches — the grouping is the only thing
 * that says which backend a row belongs to.
 */
export function SubHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
}
