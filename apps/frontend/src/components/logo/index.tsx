import { cn, Link, LinkProps } from '@heroui/react';

export function Logo(props: Omit<LinkProps, 'children'>) {
  return (
    <Link
     
      href={props.href ?? '/'}
      className={cn(props.className, 'font-bold text-inherit flex items-center gap-2')}
    >
      <img src="/logo.png" alt="Attraccess" height={32} />
      <span className="text-xl">Attraccess</span>
    </Link>
  );
}
