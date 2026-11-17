import { CreditCard, Database, Settings, ShieldCheck, UsersRound } from 'lucide-react';

export function CategoryIcon({ category }: { category: string }) {
  const Icon =
    category === 'resources'
      ? Database
      : category === 'users'
        ? UsersRound
        : category === 'system'
          ? Settings
          : category === 'billing'
            ? CreditCard
            : ShieldCheck;

  return <Icon className="size-4 shrink-0 text-default-500" aria-hidden="true" />;
}
