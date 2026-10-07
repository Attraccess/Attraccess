import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findViolations } from './card-field-violations.test-utils';
export function registerExpressionCases() {
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
}
