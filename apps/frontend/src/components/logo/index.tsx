import { Link } from 'react-router-dom';
import { cn } from '@heroui/react';
import { AttraccessLogo } from '@attraccess/ui';
import type { ComponentPropsWithoutRef } from 'react';

type LogoProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'to' | 'children'> & {
  href?: string;
};

export function Logo({ href, className, ...rest }: LogoProps) {
  return (
    <Link {...rest} to={href ?? '/'} className={cn('text-inherit no-underline', className)}>
      <AttraccessLogo className="h-8 w-auto" />
    </Link>
  );
}
