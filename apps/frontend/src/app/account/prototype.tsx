// THROWAWAY PROTOTYPE: Three account information architectures on /account?variant=A|B|C.
// All controls are local previews. Do not use this component for real account changes.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, ChevronLeft, ChevronRight, KeyRound, LockKeyhole, Mail, Search, Shield, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { Button } from '../../components/button';
import { useAuth } from '../../hooks/useAuth';
import { useUsersServiceGetCurrent } from '@attraccess/react-query-client';
import en from './prototype.en.json';
import de from './prototype.de.json';

type Variant = 'A' | 'B' | 'C';
type Topic = 'profile' | 'password' | 'twoFactor' | 'passkeys' | 'notifications' | 'tokens' | 'delete';

const topicIcons = {
  profile: UserRound,
  password: LockKeyhole,
  twoFactor: Shield,
  passkeys: KeyRound,
  notifications: Bell,
  tokens: KeyRound,
  delete: Trash2,
};

const variants: Variant[] = ['A', 'B', 'C'];
const baseTopics: Topic[] = ['profile', 'password', 'twoFactor', 'passkeys', 'notifications', 'tokens', 'delete'];

export function AccountPagePrototype({ variant }: { variant: Variant }) {
  const { t } = useTranslations({ en, de });
  const { user, hasPermission } = useAuth();
  const { data: currentUser } = useUsersServiceGetCurrent();
  const [params, setParams] = useSearchParams();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [query, setQuery] = useState('');
  const topics = baseTopics.filter((item) => item !== 'tokens' || hasPermission('users.api-tokens.manage'));

  const switchVariant = (direction: -1 | 1) => {
    const next = variants[(variants.indexOf(variant) + direction + variants.length) % variants.length];
    const updated = new URLSearchParams(params);
    updated.set('variant', next);
    setParams(updated);
    setTopic(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      switchVariant(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const content = (item: Topic) => <TopicPreview key={item} topic={item} email={currentUser?.email} username={user?.username} />;
  const title = (item: Topic) => t(`topics.${item}.title`);
  const description = (item: Topic) => t(`topics.${item}.description`);

  return (
    <div className="pb-28">
      <PageHeader title={t('title')} subtitle={t(`variants.${variant}.description`)} backTo="/" />
      <p className="mb-6 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-soft-foreground">
        {t('prototypeLabel')}
      </p>

      {variant === 'A' && (
        <div className="mx-auto max-w-5xl">
          {topic === null ? (
            <>
              <div className="mb-8 rounded-2xl border border-separator bg-surface p-6 sm:p-8">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl font-semibold text-accent-soft-foreground">
                    {(user?.username ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold">{user?.username ?? t('loading')}</h2>
                    <p className="truncate text-sm text-muted">{currentUser?.email ?? t('loading')}</p>
                  </div>
                </div>
              </div>
              <h2 className="mb-4 text-lg font-semibold">{t('allSettings')}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {topics.map((item) => {
                  const Icon = topicIcons[item];
                  return (
                    <button key={item} type="button" onClick={() => setTopic(item)} className="flex min-h-36 flex-col rounded-xl border border-separator bg-surface p-5 text-left transition-colors hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-accent">
                      <Icon size={20} className="mb-4 text-accent" />
                      <span className="font-semibold">{title(item)}</span>
                      <span className="mt-1 text-sm text-muted">{description(item)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="max-w-2xl">
              <Button variant="ghost" onPress={() => setTopic(null)}><ChevronLeft size={16} /> {t('allSettings')}</Button>
              <h2 className="mb-2 mt-8 text-2xl font-semibold">{title(topic)}</h2>
              <p className="mb-8 text-muted">{description(topic)}</p>
              {content(topic)}
            </div>
          )}
        </div>
      )}

      {variant === 'B' && (
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row">
          <nav aria-label={t('navigation')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-separator pb-3 md:w-56 md:flex-col md:border-b-0 md:pb-0">
            {topics.map((item) => {
              const Icon = topicIcons[item];
              const active = (topic ?? 'profile') === item;
              return <button key={item} type="button" onClick={() => setTopic(item)} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${active ? 'bg-accent-soft font-semibold text-accent-soft-foreground' : 'text-muted hover:bg-default-100 hover:text-foreground'}`}><Icon size={17} />{title(item)}</button>;
            })}
          </nav>
          <main className="min-w-0 flex-1">
            <div className="mb-7 border-b border-separator pb-6">
              <h2 className="text-2xl font-semibold">{title(topic ?? 'profile')}</h2>
              <p className="mt-2 text-muted">{description(topic ?? 'profile')}</p>
            </div>
            <div className="max-w-2xl">{content(topic ?? 'profile')}</div>
          </main>
        </div>
      )}

      {variant === 'C' && (
        <div className="mx-auto max-w-3xl">
          <div className="relative mb-8">
            <Search size={18} className="absolute left-4 top-3.5 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('search')} placeholder={t('search')} className="w-full rounded-xl border border-separator bg-surface py-3 pl-11 pr-4 outline-accent" />
          </div>
          {(['identity', 'access', 'preferences', 'advanced'] as const).map((group) => {
            const groupTopics = topics.filter((item) => t(`topics.${item}.group`) === group && `${title(item)} ${description(item)}`.toLowerCase().includes(query.toLowerCase()));
            if (groupTopics.length === 0) return null;
            return <section key={group} className="mb-8">
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t(`groups.${group}`)}</h2>
              <div className="overflow-hidden rounded-xl border border-separator bg-surface">
                {groupTopics.map((item) => {
                  const Icon = topicIcons[item];
                  const open = topic === item;
                  return <div key={item} className="border-b border-separator last:border-b-0">
                    <button type="button" aria-expanded={open} onClick={() => setTopic(open ? null : item)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-default-100 sm:p-5">
                      <Icon size={19} className="shrink-0 text-accent" />
                      <span className="min-w-0 flex-1"><span className="block font-medium">{title(item)}</span><span className="block text-sm text-muted">{description(item)}</span></span>
                      <ChevronRight size={18} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                    </button>
                    {open && <div className="border-t border-separator bg-default-50 p-4 sm:p-6">{content(item)}</div>}
                  </div>;
                })}
              </div>
            </section>;
          })}
        </div>
      )}

      <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-3 py-2 text-background shadow-xl" aria-label={t('switcher')}>
        <button type="button" aria-label={t('previous')} onClick={() => switchVariant(-1)} className="rounded-full p-2 hover:bg-background/20"><ChevronLeft size={18} /></button>
        <span className="min-w-36 text-center text-sm font-medium">{variant} · {t(`variants.${variant}.name`)}</span>
        <button type="button" aria-label={t('next')} onClick={() => switchVariant(1)} className="rounded-full p-2 hover:bg-background/20"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

function TopicPreview({ topic, email, username }: { topic: Topic; email?: string; username?: string }) {
  const { t } = useTranslations({ en, de });
  const [selected, setSelected] = useState('');
  const rows: Record<Topic, string[]> = {
    profile: [`${t('fields.email')}: ${email ?? t('loading')}`, `${t('fields.username')}: ${username ?? t('loading')}`],
    password: [t('fields.password')],
    twoFactor: [t('fields.twoFactor')],
    passkeys: [t('fields.passkeys')],
    notifications: [t('fields.notificationChannels'), t('fields.notificationCategories')],
    tokens: [t('fields.tokens'), t('fields.tokenPermissions')],
    delete: [t('fields.delete')],
  };
  return <div className="space-y-3">
    {rows[topic].map((row) => <button key={row} type="button" onClick={() => setSelected(row)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-separator bg-surface p-4 text-left hover:bg-default-100"><span>{row}</span><ChevronRight size={17} className="shrink-0 text-muted" /></button>)}
    {selected && <div className="rounded-xl border border-accent bg-accent-soft p-4 text-sm text-accent-soft-foreground"><div className="flex items-center gap-2 font-semibold"><Mail size={16} />{selected}</div><p className="mt-2">{t('previewNotice')}</p></div>}
  </div>;
}
