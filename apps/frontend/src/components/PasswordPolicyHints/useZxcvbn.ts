import { useEffect, useMemo, useState } from 'react';
import type { ZxcvbnResult } from '@zxcvbn-ts/core';

interface ZxcvbnState {
  ready: boolean;
  result: ZxcvbnResult | null;
}

let optionsConfigured = false;

async function loadZxcvbn() {
  const [core, common, en, de] = await Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
    import('@zxcvbn-ts/language-de'),
  ]);
  if (!optionsConfigured) {
    core.zxcvbnOptions.setOptions({
      dictionary: { ...common.dictionary, ...en.dictionary, ...de.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    });
    optionsConfigured = true;
  }
  return core.zxcvbn;
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
