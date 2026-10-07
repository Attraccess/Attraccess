import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findViolations } from './card-field-violations.test-utils';
export function registerComponentCases() {
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
}
