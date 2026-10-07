export function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="wg:text-xs wg:text-muted">{label}</dt>
      <dd className="wg:font-medium">{value}</dd>
    </div>
  );
}
