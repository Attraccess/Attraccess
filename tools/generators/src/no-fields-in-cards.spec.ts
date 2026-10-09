import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findViolations } from './card-field.test-utils';
import { rendersField } from './card-field.test-utils';
import { ALLOWLIST, owningProject, ROOT, scannedTsxFiles } from './card-field.test-utils';
import { wrapsChildrenInCard } from './card-field.test-utils';

describe('form fields are not wrapped in Cards (ATT-294 / ATT-834)', () => {
  // A guard that is silently disabled looks exactly like a guard with nothing to report —
  // which is how the previous ESLint attempt passed CI while doing nothing. So prove it fires.
  it('flags a field reached through an imported component, and not one behind a portal', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'ChangeUsernameForm.tsx'),
      `import { TextField } from '@heroui/react';
       export const ChangeUsernameForm = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'EditModal.tsx'),
      `import { StandardModal, TextField } from '../shared';
       export const EditModal = () => <StandardModal><TextField /></StandardModal>;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { ChangeUsernameForm } from './ChangeUsernameForm';
       import { EditModal } from './EditModal';
       export const Page = () => (
         <Card>
           <Card.Content>
             <ChangeUsernameForm />
             <EditModal />
           </Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<ChangeUsernameForm>');
  });

  it('flags a field behind a barrel re-export, and not a non-field from the same barrel', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'UserSearch.tsx'),
      `import { TextField } from '@heroui/react';
       export function UserSearch() { return <TextField />; }`,
    );
    fs.writeFileSync(path.join(dir, 'Avatar.tsx'), `export function Avatar() { return <div />; }`);
    fs.writeFileSync(
      path.join(dir, 'barrel.ts'),
      `export * from './UserSearch';
       export * from './Avatar';`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { UserSearch, Avatar } from './barrel';
       export const Page = () => (
         <Card>
           <Card.Content>
             <UserSearch />
             <Avatar />
           </Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<UserSearch>');
  });

  it('does not taint a plain component exported beside a field component in the same module', () => {
    // The shape of ResourceSelector.tsx (ListboxWrapper next to ResourceSelector) and of
    // SerialConfigurator/Auth (AttractapSerialCommProvider next to AttractapSerialCommGate).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'ResourceSelector.tsx'),
      `import { TextField } from '@heroui/react';
       export const ListboxWrapper = ({ children }) => <div>{children}</div>;
       const Hint = () => <TextField />;
       export const ResourceSelector = () => <><Hint /><TextField /></>;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { ListboxWrapper, ResourceSelector } from './ResourceSelector';
       export const Page = () => (
         <Card>
           <Card.Content>
             <ListboxWrapper />
             <ResourceSelector />
           </Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<ResourceSelector>');
  });

  it('follows a same-file helper component that renders the field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       const Inner = () => <TextField />;
       export const Form = () => <Inner />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './Form';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('follows an HOC-wrapped export to the component it wraps', () => {
    // `export const DocumentationEditor = memo(DocumentationEditorComponent)` — four
    // components in the tree have this shape. The declaration holds a call, not JSX.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { memo } from 'react';
       import { TextField } from '@heroui/react';
       const FormBase = () => <TextField />;
       export const Form = memo(FormBase);`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './Form';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('flags a field reached through a component declared in the same file as the Card', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const ProfileForm = () => <TextField />;
       export const Page = () => <Card><Card.Content><ProfileForm /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<ProfileForm>');
  });

  it('follows an HOC-wrapped export to a component imported from another file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'FormBase.tsx'),
      `import { TextField } from '@heroui/react';
       export const FormBase = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { memo, forwardRef } from 'react';
       import { FormBase } from './FormBase';
       export const Form = memo(forwardRef(FormBase));`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './Form';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('follows a top-level JSX variable referenced from the exported component', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       const field = <TextField />;
       export const Form = () => <div>{field}</div>;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './Form';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('follows default-exported fields and named HOC Card wrappers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { memo } from 'react';
       import { TextField } from '@heroui/react';
       const FormBase = () => <TextField />;
       export default memo(FormBase);`,
    );
    fs.writeFileSync(
      path.join(dir, 'SectionCard.tsx'),
      `import { memo } from 'react';
       import { Card } from '@heroui/react';
       const SectionCardBase = ({ children }) => <Card><Card.Content>{children}</Card.Content></Card>;
       export const SectionCard = memo(SectionCardBase);`,
    );
    fs.writeFileSync(
      path.join(dir, 'barrel.ts'),
      `import Form from './Form';
       export default Form;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       import Form from './barrel';
       import { SectionCard } from './SectionCard';
       export const Page = () => <>
         <Card><Card.Content><Form /></Card.Content></Card>
         <SectionCard><TextField /></SectionCard>
       </>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.detail).join()).toContain('<Form>');
    expect(violations.map((violation) => violation.detail).join()).toContain('<TextField>');
  });

  it('follows a barrel that re-exports a locally imported component', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       export const Form = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'barrel.ts'),
      `import { Form } from './Form';
       export { Form };`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './barrel';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('follows helpers and JSX variables used in non-identifier expression slots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const Form = () => <TextField />;
       export const Page = ({ show }) => {
         const body = <TextField />;
         const renderBody = () => <Form />;
         return <Card><Card.Content>
           {renderBody()}
           {show ? body : <Form />}
         </Card.Content></Card>;
       };`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(3);
    expect(violations.map((violation) => violation.detail).join()).toContain('<TextField>');
    expect(violations.map((violation) => violation.detail).join()).toContain('<Form>');
  });

  it('follows rendered values through logical JSX expressions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const Form = () => <TextField />;
       export const Page = ({ show, fallback }) => {
         const body = <TextField />;
         const renderBody = () => <Form />;
         return <Card><Card.Content>
           {show && body}
           {show && renderBody()}
           {fallback || body}
           {fallback ?? renderBody()}
         </Card.Content></Card>;
       };`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.detail).join()).toContain('<TextField>');
    expect(violations.map((violation) => violation.detail).join()).toContain('<Form>');
  });

  it('does not follow field components used outside rendered expression positions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       export const Form = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './Form';
       const predicate = () => false;
       export const Page = () => <Card><Card.Content>
         {predicate(Form)}
         {Form ? <div /> : <div />}
         {Form.displayName}
       </Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toEqual([]);
  });

  it('does not resolve a JSX variable belonging to a different component in the same file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       export const InnocentPanel = () => {
         const body = <div>just text</div>;
         return <Card><Card.Content>{body}</Card.Content></Card>;
       };
       export const RealForm = () => {
         const body = <TextField />;
         return <div>{body}</div>;
       };`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toEqual([]);
  });

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
});
