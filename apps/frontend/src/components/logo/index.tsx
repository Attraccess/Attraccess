import { Link } from 'react-router-dom';
import { cn } from '@heroui/react';
import type { ComponentPropsWithoutRef } from 'react';

type LogoProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'to' | 'children'> & {
  href?: string;
};

export function Logo({ href, className, ...rest }: LogoProps) {
  return (
    <Link
      {...rest}
      to={href ?? '/'}
      className={cn('font-bold text-inherit flex items-center gap-2 no-underline', className)}
    >
      <img src="/logo.png" alt="Attraccess" className="h-8 w-auto" />
      <span className="text-xl">Attraccess</span>
    </Link>
  );
}
