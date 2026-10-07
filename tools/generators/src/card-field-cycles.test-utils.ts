import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rendersField } from './card-field-rendering.test-utils';
import { ALLOWLIST, owningProject, ROOT, scannedTsxFiles } from './card-field-source.test-utils';
import { findViolations } from './card-field-violations.test-utils';
import { wrapsChildrenInCard } from './card-field-wrappers.test-utils';
export function registerWrapperAndCycleCases() {
  it('treats a component that wraps its children in a Card as a Card surface', () => {
    // The shape of maintenance-hub/section-card.tsx, which has 7 call sites.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'SectionCard.tsx'),
      `import { Card } from '@heroui/react';
       export function SectionCard({ children }) {
         return <Card><Card.Content>{children}</Card.Content></Card>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { SectionCard } from './SectionCard';
       export const Page = () => <SectionCard><TextField /></SectionCard>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('follows a wrapper of a wrapper to the Card underneath', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'SectionCard.tsx'),
      `import { Card } from '@heroui/react';
       export function SectionCard({ children }) {
         return <Card><Card.Content>{children}</Card.Content></Card>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'PanelCard.tsx'),
      `import { SectionCard } from './SectionCard';
       export function PanelCard({ children }) { return <SectionCard>{children}</SectionCard>; }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { PanelCard } from './PanelCard';
       export const Page = () => <PanelCard><TextField /></PanelCard>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('does not cache a false wrapper result computed under a truncated cycle', () => {
    // A is a Card surface directly; B only via A. A reaches <B> before its own <Card>, so
    // evaluating A first would cache B=false before A ever resolves to true — making the
    // answer depend on scan order.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'A.tsx'),
      `import { Card } from '@heroui/react';
       import { B } from './B';
       export function A({ children }) {
         return <div><B>{children}</B><Card><Card.Content>{children}</Card.Content></Card></div>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'B.tsx'),
      `import { A } from './A';
       export function B({ children }) { return <A>{children}</A>; }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { B } from './B';
       export const Page = () => <B><TextField /></B>;`,
    );

    // Warm A first — this is the scan order that poisons B.
    wrapsChildrenInCard(path.join(dir, 'A.tsx'), 'A');
    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('does not treat a component that renders a Card beside its children as a Card surface', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Sidebar.tsx'),
      `import { Card } from '@heroui/react';
       export function Sidebar({ children }) {
         return <div><Card><Card.Content>fixed blurb</Card.Content></Card><div>{children}</div></div>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { Sidebar } from './Sidebar';
       export const Page = () => <Sidebar><TextField /></Sidebar>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toEqual([]);
  });

  it('flags a field held directly in a same-file JSX variable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const body = <TextField />;
       export const Page = () => (
         <Card>
           <Card.Content>{body}</Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('does not cache a false result computed under a truncated import cycle', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'A.tsx'),
      `import { B } from './B';
       import { TextField } from '@heroui/react';
       export const A = () => <><B /><TextField /></>;`,
    );
    fs.writeFileSync(path.join(dir, 'B.tsx'), `import { A } from './A'; export const B = () => <A />;`);
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { B } from './B';
       export const Page = () => <Card><Card.Content><B /></Card.Content></Card>;`,
    );

    // Warm A first: the A -> B -> A cycle truncates inside B, and B's `false` must not be cached.
    rendersField(path.join(dir, 'A.tsx'), 'A');
    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<B>');
  });

  it('finds no HeroUI field rendered on a Card surface', () => {
    const files = scannedTsxFiles();
    expect(files.length).toBeGreaterThan(100);

    const violations = files.flatMap(findViolations).filter((violation) => !ALLOWLIST.has(violation.location));

    expect(violations.map((v) => `${v.location} — ${v.detail}`).join('\n')).toBe('');
  });

  it('scans only projects wired into nx affected via generators.implicitDependencies', () => {
    const generatorsJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'tools', 'generators', 'project.json'), 'utf-8'),
    ) as { implicitDependencies?: string[] };
    const wired = new Set(generatorsJson.implicitDependencies ?? []);

    // Plugin projects are intentionally unwired: core tooling must not enumerate
    // plugins by name. The CI `plugins` job runs this guard whenever any plugin
    // is affected, so plugin sources stay covered without the name coupling.
    const owners = new Set<string>();
    for (const file of scannedTsxFiles()) {
      const project = owningProject(file);
      if (project && !project.tags.includes('type:plugin')) owners.add(project.name);
    }

    const unwired = [...owners].filter((name) => !wired.has(name));
    expect(unwired.join('\n')).toBe('');
  });
}
