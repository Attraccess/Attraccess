import React from 'react';
import { Link } from '@heroui/react';
import { ExternalLink } from 'lucide-react';

interface LinkListData {
  type: 'link-list';
  title?: string;
  links: { label: string; url: string }[];
}

export function LinkList({ data }: { data: LinkListData }) {
  return (
    <div className="my-2">
      {data.title && <p className="text-xs font-medium text-default-600 mb-1">{data.title}</p>}
      <ul className="space-y-1">
        {data.links.map((link, i) => (
          <li key={i} className="flex items-center gap-1">
            <ExternalLink size={10} className="text-default-400 shrink-0" />
            <Link
              href={link.url}
              size="sm"
              isExternal={link.url.startsWith('http') || link.url.startsWith('/docs/')}
              className="text-xs"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function isLinkList(data: unknown): data is LinkListData {
  return (data as any)?.type === 'link-list' && Array.isArray((data as any)?.links);
}
