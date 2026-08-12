import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Link, Skeleton } from '@heroui/react';
import { PageHeader } from '../../components/pageHeader';

interface Dependency {
  name: string;
  version: string;
  author: string;
  license: string;
  url: string;
}

/**
 * `dependencies.json` is generated from the root package.json by
 * apps/frontend/extract-dependencies.cjs, so it only covers npm packages. Anything vendored
 * into `public/` by hand has to be listed here by hand. See
 * apps/frontend/public/openscad/NOTICE.md.
 */
const VENDORED_DEPENDENCIES: Dependency[] = [
  {
    name: 'OpenSCAD',
    version: '2025.07.18',
    author: 'Marius Kintel, Clifford Wolf and contributors',
    license: 'GPL-2.0-or-later',
    // Our build, carrying the FT_LOAD_NO_HINTING patch; also where the
    // corresponding source lives, per the GPL.
    url: 'https://github.com/Attraccess/openscad-wasm',
  },
  {
    name: 'Sansation',
    version: '1.31',
    author: 'Bernd Montag',
    // Not OFL, despite what font aggregator sites claim: the author's own ReadMe
    // grants redistribution as freeware. See NOTICE.md.
    license: 'Freeware (redistributable)',
    url: 'https://www.dafont.com/sansation.font',
  },
];

function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

function CardSkeleton() {
  return (
    <Card className="w-full">
      <Card.Content className="p-4">
        <div className="space-y-3">
          <div>
            <Skeleton className="h-6 w-3/4 rounded-lg mb-2" />
            <Skeleton className="h-4 w-1/4 rounded-lg" />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16 rounded-lg" />
              <Skeleton className="h-4 w-24 rounded-lg" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16 rounded-lg" />
              <Skeleton className="h-4 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </Card.Content>
      <Card.Footer className="flex justify-end">
        <Skeleton className="h-4 w-24 rounded-lg" />
      </Card.Footer>
    </Card>
  );
}

export function Dependencies() {
  const { t } = useTranslations({
    de,
    en,
  });

  const { data: dependencies, status: fetchStatus } = useQuery({
    queryKey: ['dependencies'],
    queryFn: () => fetch('/dependencies.json').then((res) => res.json() as Promise<Dependency[]>),
  });

  const isLoading = fetchStatus === 'pending';

  const allDependencies = useMemo(
    () => [...VENDORED_DEPENDENCIES, ...(dependencies ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [dependencies],
  );

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {allDependencies.map((dependency) => (
            <Card key={dependency.name} className="w-full">
              <Card.Content className="p-4">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{dependency.name}</h3>
                    <p className="text-sm text-default-500">{dependency.version}</p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-default-700">{t('author')}: </span>
                      <span className="text-default-600">{dependency.author}</span>
                    </div>

                    <div>
                      <span className="font-medium text-default-700">{t('license')}: </span>
                      <span className="text-default-600">{dependency.license}</span>
                    </div>
                  </div>
                </div>
              </Card.Content>
              <Card.Footer className="flex justify-end">
                <Link
                  href={dependency.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm"

                >
                  {getDomainFromUrl(dependency.url)}
                </Link>
              </Card.Footer>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
