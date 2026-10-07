export function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sh:flex sh:items-baseline sh:justify-between sh:gap-3 sh:border-b sh:border-default-200 sh:py-2 sh:last:border-b-0">
      <span className="sh:text-xs sh:font-medium sh:uppercase sh:tracking-wide sh:text-default-500">{label}</span>
      <span className="sh:min-w-0 sh:truncate sh:text-sm sh:text-default-800" title={value}>
        {value}
      </span>
    </div>
  );
}
