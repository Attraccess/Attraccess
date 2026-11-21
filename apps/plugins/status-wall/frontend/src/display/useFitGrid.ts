import { useEffect, useRef, useState } from 'react';
import { fitGrid, type GridFit } from './fitGrid';

/** Measures the element behind `ref` and fits `count` tiles into it (see {@link fitGrid}). */
export function useFitGrid(count: number, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit: GridFit = fitGrid(count, size.width, size.height, gap);
  return { ref, ...fit };
}
