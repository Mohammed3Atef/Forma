import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useSession } from '@/services/auth/sessionStore';
import { useCan } from '@/services/auth/permissions';
import {
  createUser,
  fetchUsersPage,
  setAccountStatus,
  setRole,
} from '@/services/platform/accountsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { AccountStatus, Role, UserRecord } from '@/types';

const ROLE_FILTERS: (Role | 'all')[] = ['all', 'super_admin', 'admin', 'coach', 'client'];
const STATUSES: AccountStatus[] = ['active', 'pending', 'suspended', 'disabled'];

/** Roles the actor is allowed to assign. */
function assignableRoles(actorRole: Role | undefined): Role[] {
  if (actorRole === 'super_admin') return ['client', 'coach', 'admin', 'super_admin'];
  if (actorRole === 'admin') return ['client', 'coach'];
  return [];
}

/** Whether the actor may modify the target account at all. */
function canManage(actorRole: Role | undefined, target: UserRecord): boolean {
  if (actorRole === 'super_admin') return true;
  if (actorRole === 'admin') return target.role === 'client' || target.role === 'coach';
  return false;
}

export function AdminAccounts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const actorRole = useSession((s) => s.account?.role);
  const actorId = useSession((s) => s.account?.id ?? 'self');
  const canCreate = useCan('users.create');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ['users'],
    queryFn: ({ pageParam }) => fetchUsersPage(25, pageParam as QueryDocumentSnapshot | null),
    initialPageParam: null as QueryDocumentSnapshot | null,
    getNextPageParam: (lastPage) => lastPage.cursor,
  });

  const all = useMemo(() => list.data?.pages.flatMap((p) => p.users) ?? [], [list.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    });
  }, [all, roleFilter, search]);

  const sentinel = useInfiniteScroll(() => void list.fetchNextPage(), !!list.hasNextPage && !list.isFetchingNextPage);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['platformStats'] });
  };

  const statusMut = useMutation({
    mutationFn: ({ target, status }: { target: UserRecord; status: AccountStatus }) => setAccountStatus(target, status),
    onSuccess: () => {
      refresh();
      setSelected(null);
    },
  });
  const roleMut = useMutation({
    mutationFn: ({ target, role }: { target: UserRecord; role: Role }) => setRole(target, role),
    onSuccess: () => {
      refresh();
      setSelected(null);
    },
  });

  return (
    <>
      <TopBar
        title={t('admin.accounts')}
        eyebrow={t(actorRole === 'super_admin' ? 'platform.superAdmin' : 'platform.admin')}
        right={
          canCreate ? (
            <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('admin.createAccount')} onClick={() => setCreating(true)}>
              <Icon name="plus" size={20} />
            </button>
          ) : undefined
        }
      />

      <div className="relative mb-3">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
          <Icon name="search" size={18} />
        </span>
        <input
          className="input ps-10"
          placeholder={t('admin.searchAccounts')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {ROLE_FILTERS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(r)}
            className={`chip whitespace-nowrap ${roleFilter === r ? 'chip-on' : ''}`}
          >
            {r === 'all' ? t('admin.allRoles') : t(`roles.${r}`)}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('admin.noAccounts')}</p>
      ) : (
        <div className="card divide-y divide-line-soft">
          {filtered.map((u) => (
            <button key={u.id} type="button" onClick={() => setSelected(u)} className="row w-full text-start">
              <span className="row-av font-serif">{(u.displayName || u.email || '?').charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.displayName || u.email}</span>
                <span className="block truncate text-[13px] text-earth-muted">{t(`roles.${u.role}`)}</span>
              </span>
              <StatusBadge status={u.accountStatus} />
            </button>
          ))}
        </div>
      )}
      <div ref={sentinel} />
      {list.isFetchingNextPage && <p className="py-4 text-center text-sm text-earth-muted">{t('auth.working')}</p>}

      {/* Per-account actions */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.displayName || selected?.email}>
        {selected && (
          <div className="space-y-4">
            {selected.role === 'client' && (
              <button type="button" className="btn-ghost w-full" onClick={() => navigate(`/admin/clients/${selected.id}`)}>
                {t('admin.viewClientDetails')}
              </button>
            )}
            <AccountActions
              target={selected}
              actorRole={actorRole}
              onSetStatus={(status) => statusMut.mutate({ target: selected, status })}
              onSetRole={(role) => roleMut.mutate({ target: selected, role })}
              busy={statusMut.isPending || roleMut.isPending}
            />
          </div>
        )}
      </Sheet>

      {/* Create account */}
      <Sheet open={creating} onClose={() => setCreating(false)} title={t('admin.newAccount')}>
        <CreateAccountForm
          actorRole={actorRole}
          createdBy={actorId}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      </Sheet>
    </>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const { t } = useTranslation();
  const tone =
    status === 'active'
      ? 'text-success'
      : status === 'pending'
        ? 'text-warn'
        : 'text-danger';
  return <span className={`font-mono text-[10.5px] uppercase tracking-[0.06em] ${tone}`}>{t(`platform.status.${status}`)}</span>;
}

function AccountActions({
  target,
  actorRole,
  onSetStatus,
  onSetRole,
  busy,
}: {
  target: UserRecord;
  actorRole: Role | undefined;
  onSetStatus: (s: AccountStatus) => void;
  onSetRole: (r: Role) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const canStatus = useCan('users.manageStatus');
  const canRoles = useCan('users.manageRoles');
  const manageable = canManage(actorRole, target);
  const roles = assignableRoles(actorRole);

  if (!manageable) {
    return <p className="py-4 text-sm text-earth-muted">{t('admin.cannotEditSuper')}</p>;
  }

  const changeStatus = async (s: AccountStatus) => {
    if (s === target.accountStatus) return;
    const danger = s === 'suspended' || s === 'disabled';
    const ok = await confirmDialog({
      title: t(`platform.status.${s}`),
      message: t('admin.confirmStatus', { name: target.displayName || target.email }),
      danger,
    });
    if (ok) onSetStatus(s);
  };

  const changeRole = async (r: Role) => {
    if (r === target.role) return;
    const ok = await confirmDialog({
      title: t(`roles.${r}`),
      message: t('admin.confirmRole', { name: target.displayName || target.email }),
      danger: true,
    });
    if (ok) onSetRole(r);
  };

  return (
    <div className="space-y-5">
      <div className="text-sm text-earth-muted">{target.email}</div>

      {canRoles && roles.length > 0 && (
        <div>
          <div className="label mb-2">{t('admin.changeRole')}</div>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => void changeRole(r)}
                className={`chip ${target.role === r ? 'chip-on' : ''}`}
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {canStatus && (
        <div>
          <div className="label mb-2">{t('admin.status')}</div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void changeStatus(s)}
                className={`chip ${target.accountStatus === s ? 'chip-on' : ''}`}
              >
                {t(`platform.status.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateAccountForm({
  actorRole,
  createdBy,
  onDone,
}: {
  actorRole: Role | undefined;
  createdBy: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const roles = assignableRoles(actorRole);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: (roles[0] ?? 'client') as Role });
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      createUser({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName,
        role: form.role,
        accountStatus: 'active',
        createdBy,
      }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : 'Failed'),
  });

  const valid = form.email.trim().length > 3 && form.password.length >= 6;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (valid) mut.mutate();
      }}
    >
      <input className="input" type="email" autoComplete="off" placeholder={t('settings.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="input" placeholder={t('settings.name')} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <input className="input" type="password" autoComplete="new-password" placeholder={t('admin.tempPassword')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <div>
        <div className="label mb-2">{t('platform.role')}</div>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button key={r} type="button" onClick={() => setForm({ ...form, role: r })} className={`chip ${form.role === r ? 'chip-on' : ''}`}>
              {t(`roles.${r}`)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={!valid || mut.isPending} className="btn-primary w-full disabled:opacity-40">
        {mut.isPending ? t('auth.working') : t('admin.createAccount')}
      </button>
    </form>
  );
}
