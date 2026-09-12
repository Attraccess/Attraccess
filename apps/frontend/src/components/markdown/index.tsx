// Central preconfigured react-markdown wrapper used across the frontend app
// FEATURE: ATT-407 shared markdown rendering abstraction
import { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@heroui/react';

export type MarkdownVariant = 'default' | 'compact';

interface MarkdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: string;
  variant?: MarkdownVariant;
}

const BASE_CLASSES =
  'prose prose-slate dark:prose-invert max-w-none ' +
  'prose-headings:text-foreground prose-headings:font-semibold ' +
  'prose-a:text-accent prose-a:no-underline hover:prose-a:underline ' +
  'prose-strong:text-foreground prose-strong:font-semibold ' +
  'prose-code:text-accent prose-code:bg-surface-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-surface-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-lg ' +
  'prose-blockquote:border-l-accent prose-blockquote:bg-surface-secondary prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:text-muted ' +
  'prose-ul:text-foreground prose-ol:text-foreground ' +
  'prose-li:text-foreground prose-li:marker:text-muted ' +
  'prose-hr:border-border ' +
  'prose-table:text-foreground prose-thead:border-border prose-tbody:border-border prose-th:text-foreground prose-td:text-foreground';

const VARIANT_CLASSES: Record<MarkdownVariant, string> = {
  default:
    BASE_CLASSES +
    ' prose-h1:text-2xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2 ' +
    'prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 ' +
    'prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 ' +
    'prose-p:text-foreground prose-p:leading-relaxed',
  compact:
    'prose prose-sm prose-slate dark:prose-invert max-w-none text-muted ' +
    'prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-0 prose-headings:mb-2 ' +
    'prose-h1:text-base prose-h2:text-base prose-h3:text-sm ' +
    'prose-p:my-1 prose-p:text-muted ' +
    'prose-a:text-accent prose-a:no-underline hover:prose-a:underline ' +
    'prose-code:text-accent prose-code:bg-surface-secondary prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ' +
    'prose-blockquote:border-l-accent prose-blockquote:my-1 prose-blockquote:py-0 prose-blockquote:text-muted ' +
    'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
};

export function Markdown({ children, variant = 'default', className, ...rest }: MarkdownProps) {
  return (
    <div className={cn(VARIANT_CLASSES[variant], className)} {...rest}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
