// PROTOTYPE — throwaway, dev-only. Open http://localhost:<frontend>/?prototype=wago-io&variant=A
// Three structurally different CC100 I/O + Modbus config UIs with simulated live values. No backend, no persistence.
import '../styles.css';
import { Button } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConfig, useLive, useSimulation } from './store';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';

const variants = [
  ['A', 'Front panel', VariantA],
  ['B', 'Device browser', VariantB],
  ['C', 'Signals list', VariantC],
] as const;

export function IoPrototype() {
  useSimulation();
  const [key, setKey] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'A');
  const index = Math.max(0, variants.findIndex(([k]) => k === key));
  const [, name, Variant] = variants[index];
  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length][0];
    const url = new URL(location.href);
    url.searchParams.set('variant', next);
    history.replaceState(null, '', url);
    setKey(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable], [role=listbox], [role=slider]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <main className="wg:mx-auto wg:flex wg:max-w-[1200px] wg:flex-col wg:gap-5 wg:p-4 wg:pb-40 wg:md:p-6">
      <header>
        <p className="wg:text-sm wg:text-muted">WAGO / Workshop CC100</p>
        <h1 className="wg:mt-1 wg:text-3xl wg:font-semibold">Inputs &amp; outputs</h1>
      </header>
      <Variant />
      <StateDump />
      <div className="wg:fixed wg:bottom-4 wg:left-1/2 wg:z-50 wg:flex wg:-translate-x-1/2 wg:items-center wg:gap-2 wg:rounded-full wg:bg-foreground wg:px-2 wg:py-1 wg:text-background wg:shadow-xl">
        <Button isIconOnly size="sm" variant="ghost" className="wg:text-background" aria-label="Previous variant" onPress={() => go(-1)}>
          <ChevronLeft className="wg:size-4" />
        </Button>
        <span className="wg:min-w-44 wg:text-center wg:text-sm wg:font-medium">
          {variants[index][0]} ({name})
        </span>
        <Button isIconOnly size="sm" variant="ghost" className="wg:text-background" aria-label="Next variant" onPress={() => go(1)}>
          <ChevronRight className="wg:size-4" />
        </Button>
      </div>
    </main>
  );
}

function StateDump() {
  const config = useConfig();
  const live = useLive();
  return (
    <details className="wg:text-xs wg:text-muted">
      <summary className="wg:cursor-pointer">Prototype state</summary>
      <pre className="wg:overflow-auto">{JSON.stringify({ config, live }, null, 2)}</pre>
    </details>
  );
}
