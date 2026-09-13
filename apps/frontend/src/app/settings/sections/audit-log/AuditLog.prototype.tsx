// THROWAWAY: compare table, activity feed, and inspector layouts on /settings/audit-log?variant=A|B|C.
import { Button, Card, Chip, Input, Label, TextField } from '@heroui/react';
import { ArrowLeftIcon, ArrowRightIcon, ChevronRightIcon, DownloadIcon, FilterIcon, SearchIcon, Settings2Icon, ShieldCheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const entries = [
  { id: 1042, time: '15:24', event: 'Resource updated', actor: 'Alex Meyer', target: 'Laser cutter', domain: 'Resources', before: 'Introduction required: No', after: 'Introduction required: Yes' },
  { id: 1041, time: '15:18', event: 'Maintenance scheduled', actor: 'Alex Meyer', target: 'Laser cutter', domain: 'Resources', before: 'No schedule', after: 'Every 30 days' },
  { id: 1040, time: '15:12', event: 'Role assigned', actor: 'Robin Schmidt', target: 'Sam Becker', domain: 'Identity', before: 'Member', after: 'Workshop manager' },
  { id: 1039, time: '14:57', event: 'Configuration published', actor: 'Alex Meyer', target: 'Workshop controller', domain: 'WAGO', before: 'Revision 6', after: 'Revision 7' },
  { id: 1038, time: '14:31', event: 'Session ended', actor: 'Sam Becker', target: '3D printer', domain: 'Resources', before: 'In use', after: 'Available' },
];
const variants = ['A', 'B', 'C'];
const names: Record<string, string> = { A: 'Table and detail panel', B: 'Activity timeline', C: 'Split inspector' };

export function AuditLogPrototype() {
  const [params, setParams] = useSearchParams();
  const variant = params.get('variant') ?? 'A';
  const [selected, setSelected] = useState(entries[0]);
  const [showSettings, setShowSettings] = useState(false);
  const cycle = (direction: number) => setParams({ variant: variants[(variants.indexOf(variant) + direction + variants.length) % variants.length] });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')) return;
      if (event.key === 'ArrowRight') cycle(1);
      if (event.key === 'ArrowLeft') cycle(-1);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  });

  const header = <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="space-y-1"><h2 className="text-2xl font-semibold">Audit log</h2><p className="text-sm text-muted">Understand what changed, who changed it, and when.</p></div>
    <div className="flex gap-2"><Button variant="secondary" onPress={() => setShowSettings(!showSettings)}><Settings2Icon size={16} />Logging settings</Button><Button variant="outline"><DownloadIcon size={16} />Export</Button></div>
  </div>;
  const filters = <div className="flex flex-wrap items-end gap-3"><TextField className="min-w-48 flex-1"><Label>Find activity</Label><Input placeholder="Event, person or resource" /></TextField><Button variant="secondary"><FilterIcon size={16} />All domains</Button><Button variant="secondary">Last 7 days</Button><Button variant="outline"><SearchIcon size={16} />Search</Button></div>;
  const detail = <Card variant="secondary"><Card.Header><div className="flex items-center justify-between"><Chip color="success" size="sm">Succeeded</Chip><span className="text-xs text-muted">#{selected.id}</span></div><Card.Title>{selected.event}</Card.Title><Card.Description>{selected.actor} · {selected.target} · Today, {selected.time}</Card.Description></Card.Header><Card.Content className="space-y-4"><h3 className="text-sm font-medium">What changed</h3><div className="grid grid-cols-2 gap-4"><div><p className="mb-2 text-xs text-muted">Before</p><p className="text-sm">{selected.before}</p></div><div><p className="mb-2 text-xs text-muted">After</p><p className="text-sm">{selected.after}</p></div></div><p className="border-t border-separator pt-3 text-xs text-muted">Source: web session · Audit records cannot be edited.</p></Card.Content></Card>;

  return <div className="space-y-6 pb-20">
    {header}
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><ShieldCheckIcon size={16} className="text-success" /><span>Logging enabled</span><span>·</span><span>All domains</span><span>·</span><span>90-day retention</span></div>
    {showSettings && <Card><Card.Header><Card.Title>Logging settings</Card.Title><Card.Description>A separate task from investigating activity. Domain switches preserve every other selection.</Card.Description></Card.Header><Card.Content><p>Master switch · Per-domain checkboxes · Retention period · Save / Discard</p></Card.Content></Card>}
    {variant === 'A' && <>{filters}<div className="overflow-x-auto rounded-xl border border-separator"><table className="w-full text-left text-sm"><thead className="bg-surface-secondary text-xs text-muted"><tr>{['Time', 'Activity', 'Actor', 'Target', ''].map((title) => <th key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-separator"><td className="px-4 py-4 text-muted">{entry.time}</td><td className="px-4 py-4"><p className="font-medium">{entry.event}</p><span className="text-xs text-muted">{entry.domain}</span></td><td className="px-4 py-4">{entry.actor}</td><td className="px-4 py-4">{entry.target}</td><td className="px-2"><Button aria-label={`Inspect ${entry.id}`} variant="ghost" isIconOnly onPress={() => setSelected(entry)}><ChevronRightIcon size={16} /></Button></td></tr>)}</tbody></table></div>{detail}</>}
    {variant === 'B' && <div className="grid gap-8 xl:grid-cols-[220px_1fr]"><aside className="space-y-4"><TextField><Label>Search activity</Label><Input placeholder="Search events" /></TextField><p className="text-xs font-semibold uppercase text-muted">Domains</p>{['All activity', 'Resources', 'Identity', 'Projects', 'WAGO', 'Billing'].map((domain) => <Button key={domain} variant={domain === 'All activity' ? 'secondary' : 'ghost'} className="w-full justify-start">{domain}</Button>)}</aside><div className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-medium">Today, 13 September</h3><span className="text-sm text-muted">5 events</span></div>{entries.map((entry) => <Card key={entry.id} variant="secondary"><Card.Header><div className="flex justify-between"><Chip size="sm">{entry.domain}</Chip><span className="text-xs text-muted">{entry.time}</span></div><Card.Title>{entry.event}</Card.Title><Card.Description>{entry.actor} · {entry.target}</Card.Description></Card.Header><Card.Footer><Button variant="ghost" onPress={() => setSelected(entry)}>View changes <ChevronRightIcon size={16} /></Button></Card.Footer>{selected.id === entry.id && <Card.Content className="text-sm">{entry.before} → {entry.after}</Card.Content>}</Card>)}</div></div>}
    {variant === 'C' && <>{filters}<div className="grid gap-5 xl:grid-cols-2"><div className="space-y-2">{entries.map((entry) => <Button key={entry.id} variant={selected.id === entry.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-between p-4 text-left" onPress={() => setSelected(entry)}><span className="space-y-1"><span className="block font-medium">{entry.event}</span><span className="block text-xs text-muted">{entry.actor} · {entry.target}</span></span><span className="text-xs text-muted">{entry.time}</span></Button>)}</div>{detail}</div></>}
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-separator bg-surface p-2 shadow-lg"><Button aria-label="Previous prototype" isIconOnly variant="ghost" onPress={() => cycle(-1)}><ArrowLeftIcon size={16} /></Button><div className="text-center"><p className="text-xs text-muted">Throwaway prototype · illustrative data</p><p className="text-sm font-semibold">{variant}: {names[variant]}</p></div><Button aria-label="Next prototype" isIconOnly variant="ghost" onPress={() => cycle(1)}><ArrowRightIcon size={16} /></Button></div>
  </div>;
}
