/** One label/value pair of a `<dl>` in the fabric & backup section. */
export function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="mt:flex mt:flex-col">
      <dt className="mt:text-xs mt:text-muted">{label}</dt>
      <dd className="mt:break-all">{children}</dd>
    </div>
  );
}
