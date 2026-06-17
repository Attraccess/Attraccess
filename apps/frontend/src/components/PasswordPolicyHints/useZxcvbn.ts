import { useEffect, useMemo, useState } from 'react';
import type { ZxcvbnFactory, ZxcvbnResult } from '@zxcvbn-ts/core';

interface ZxcvbnState {
  ready: boolean;
  result: ZxcvbnResult | null;
}

let factory: ZxcvbnFactory | null = null;

async function loadZxcvbn() {
  const [{ ZxcvbnFactory: Factory }, common, en, de] = await Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
    import('@zxcvbn-ts/language-de'),
  ]);
  if (!factory) {
    factory = new Factory({
      dictionary: { ...common.dictionary, ...en.dictionary, ...de.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    });
  }
  return (pw: string, inputs?: string[]) => factory!.check(pw, inputs);
}

export function useZxcvbn(password: string, userInputs: string[] = []): ZxcvbnState {
  const [zxcvbnFn, setZxcvbnFn] = useState<((pw: string, inputs?: string[]) => ZxcvbnResult) | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadZxcvbn().then((fn) => {
      if (!cancelled) {
        setZxcvbnFn(() => fn);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredInputs = useMemo(() => userInputs.filter(Boolean), [userInputs]);

  return useMemo(() => {
    if (!zxcvbnFn || !password) {
      return { ready: !!zxcvbnFn, result: null };
    }
    return { ready: true, result: zxcvbnFn(password, filteredInputs) };
  }, [zxcvbnFn, password, filteredInputs]);
}
