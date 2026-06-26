import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { RowCheckbox } from '@/components/ui/RowCheckbox';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useSelection } from '@/hooks/useSelection';
import { useSession } from '@/services/auth/sessionStore';
import { useCan } from '@/services/auth/permissions';
import {
  bulkSetAccountStatus,
  createUser,
  deleteUser,
  fetchUsersPage,
  setAccountStatus,
  setRole,
} from '@/services/platform/accountsApi';
import { confirmDialog } from '@/stores/dialogStore';
import { passwordError } from '@/lib/password';
import type { AccountStatus, Role, UserRecord } from '@/types';

const ROLE_FILTERS: (Role | 'all')[] = ['all', 'super_admin', 'admin', 'coach', 'client'];
const STATUS_FILTERS: (AccountStatus | 'all')[] = ['all', 'active', 'pending', 'suspended', 'disabled'];
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
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [selected, setSelected] = useState<UserRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const sel = useSelection();
  const canStatus = useCan('users.manageStatus');

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
      if (statusFilter !== 'all' && u.accountStatus !== statusFilter) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || (u.phone ?? '').includes(q);
    });
  }, [all, roleFilter, statusFilter, search]);

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
  const deleteMut = useMutation({
    mutationFn: (target: UserRecord) => deleteUser(target),
    onSuccess: () => {
      refresh();
      setSelected(null);
    },
  });
  const bulkStatusMut = useMutation({
    mutationFn: ({ targets, status }: { targets: UserRecord[]; status: AccountStatus }) => bulkSetAccountStatus(targets, status),
    onSuccess: () => {
      refresh();
      sel.clear();
    },
  });

  // Accounts the actor may act on in bulk (and may select).
  const selectableIds = useMemo(() => filtered.filter((u) => canManage(actorRole, u)).map((u) => u.id), [filtered, actorRole]);
  const allOnPageSelected = selectableIds.length > 0 && selectableIds.every((id) => sel.has(id));
  const someOnPageSelected = selectableIds.some((id) => sel.has(id));

  const runBulkStatus = async (status: AccountStatus) => {
    const targets = filtered.filter((u) => sel.has(u.id) && canManage(actorRole, u));
    if (targets.length === 0) return;
    const ok = await confirmDialog({
      title: t(`platform.status.${status}`),
      message: t('common.bulk.confirmStatus', { n: targets.length }),
      danger: status !== 'active',
    });
    if (ok) bulkStatusMut.mutate({ targets, status });
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <TopBar
        testId="admin-accounts"
        title={t('admin.accounts')}
        eyebrow={t(actorRole === 'super_admin' ? 'platform.superAdmin' : 'platform.admin')}
        right={
          canCreate ? (
            <button type="button" data-testid="admin-create-account" className="icon-btn h-[42px] w-[42px]" aria-label={t('admin.createAccount')} onClick={() => setCreating(true)}>
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

      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
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
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`status-filter-${s}`}
            onClick={() => setStatusFilter(s)}
            className={`chip whitespace-nowrap ${statusFilter === s ? 'chip-on' : ''}`}
          >
            {s === 'all' ? t('admin.allStatuses') : t(`platform.status.${s}`)}
          </button>
        ))}
      </div>

      {canStatus && selectableIds.length > 0 && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <RowCheckbox
            checked={allOnPageSelected}
            indeterminate={someOnPageSelected && !allOnPageSelected}
            onToggle={() => sel.setMany(selectableIds, !allOnPageSelected)}
            label={t('common.selectAll')}
            testId="account-select-all"
          />
          <span className="text-[12px] text-earth-subtle">{t('common.selectAll')}</span>
        </div>
      )}

      {list.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('admin.noAccounts')}</p>
      ) : (
        <div className="card divide-y divide-line-soft">
          {filtered.map((u) => {
            const selectable = canStatus && canManage(actorRole, u);
            return (
              <div key={u.id} className={`flex items-center ${sel.has(u.id) ? 'bg-brand/10' : ''}`}>
                {selectable && (
                  <span className="ps-3">
                    <RowCheckbox checked={sel.has(u.id)} onToggle={() => sel.toggle(u.id)} label={t('common.bulk.selectRow')} testId="account-select" />
                  </span>
                )}
                <button type="button" data-testid="account-row" data-account-id={u.id} data-account-role={u.role} onClick={() => setSelected(u)} className="row min-w-0 flex-1 text-start">
                  <Avatar name={u.displayName || u.email} photoUrl={u.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.displayName || u.email}</span>
                    <span className="block truncate text-[13px] text-earth-muted">{u.email}</span>
                    {u.phone && <span className="block truncate font-mono text-[11px] text-earth-subtle" dir="ltr">{u.phone}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={u.accountStatus} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-earth-subtle">{t(`roles.${u.role}`)}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div ref={sentinel} />
      {list.isFetchingNextPage && <p className="py-4 text-center text-sm text-earth-muted">{t('auth.working')}</p>}

      {canStatus && (
        <BulkActionBar count={sel.count} onClear={sel.clear}>
          <button type="button" data-testid="bulk-activate" className="chip" disabled={bulkStatusMut.isPending} onClick={() => void runBulkStatus('active')}>{t('common.bulk.activate')}</button>
          <button type="button" data-testid="bulk-suspend" className="chip" disabled={bulkStatusMut.isPending} onClick={() => void runBulkStatus('suspended')}>{t('common.bulk.suspend')}</button>
          <button type="button" data-testid="bulk-disable" className="chip text-danger" disabled={bulkStatusMut.isPending} onClick={() => void runBulkStatus('disabled')}>{t('common.bulk.disable')}</button>
        </BulkActionBar>
      )}

      {/* Per-account actions */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} size="md" title={selected?.displayName || selected?.email}>
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
              onDelete={() => deleteMut.mutate(selected)}
              busy={statusMut.isPending || roleMut.isPending || deleteMut.isPending}
            />
          </div>
        )}
      </Sheet>

      {/* Create account */}
      <Sheet open={creating} onClose={() => setCreating(false)} size="md" title={t('admin.newAccount')}>
        <CreateAccountForm
          actorRole={actorRole}
          createdBy={actorId}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      </Sheet>
    </div>
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
  onDelete,
  busy,
}: {
  target: UserRecord;
  actorRole: Role | undefined;
  onSetStatus: (s: AccountStatus) => void;
  onSetRole: (r: Role) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const canStatus = useCan('users.manageStatus');
  const canRoles = useCan('users.manageRoles');
  const manageable = canManage(actorRole, target);
  const roles = assignableRoles(actorRole);

  if (!manageable) {
    return <p className="py-4 text-sm text-earth-muted" data-testid="cannot-edit-account">{t('admin.cannotEditSuper')}</p>;
  }

  const doDelete = async () => {
    const ok = await confirmDialog({
      title: t('admin.deleteAccount'),
      message: t('admin.confirmDelete', { name: target.displayName || target.email }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) onDelete();
  };

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
      <div className="text-sm text-earth-muted">
        {target.email}
        {target.phone && <span className="mt-0.5 block font-mono text-[12px]" dir="ltr">{target.phone}</span>}
      </div>

      {canRoles && roles.length > 0 && (
        <div>
          <div className="label mb-2">{t('admin.changeRole')}</div>
          <div className="flex flex-wrap gap-2" data-testid="role-options">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                data-testid={`set-role-${r}`}
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
          <div className="flex flex-wrap gap-2" data-testid="status-options">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`set-status-${s}`}
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

      {/* Hard delete — super admin only (rules enforce it too). */}
      {actorRole === 'super_admin' && (
        <div className="border-t border-line-soft pt-4">
          <button type="button" data-testid="delete-account" disabled={busy} className="btn-ghost w-full text-danger disabled:opacity-40" onClick={() => void doDelete()}>
            <Icon name="close" size={16} /> {t('admin.deleteAccount')}
          </button>
          <p className="mt-1 text-[12px] text-earth-subtle">{t('admin.deleteHint')}</p>
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
  const [form, setForm] = useState({ email: '', password: '', displayName: '', phone: '', role: (roles[0] ?? 'client') as Role });
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      createUser({
        email: form.email.trim(),
        password: form.password,
        displayName: form.displayName,
        phone: form.phone.trim() || undefined,
        role: form.role,
        accountStatus: 'active',
        createdBy,
      }),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : 'Failed'),
  });

  const valid = form.email.trim().length > 3 && form.phone.trim().length > 0 && !passwordError(form.password);

  return (
    <form
      className="space-y-3"
      data-testid="create-account-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (valid) mut.mutate();
      }}
    >
      <TextInput label={t('field.email')} type="email" autoComplete="off" data-testid="create-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <TextInput label={t('field.name')} data-testid="create-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <TextInput label={t('field.phone')} type="tel" inputMode="tel" autoComplete="off" data-testid="create-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <TextInput label={t('admin.tempPassword')} type="password" autoComplete="new-password" data-testid="create-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <p className="text-[12px] text-earth-subtle">{t('auth.pwHint')}</p>
      <div>
        <div className="label mb-2">{t('platform.role')}</div>
        <div className="flex flex-wrap gap-2" data-testid="create-role-options">
          {roles.map((r) => (
            <button key={r} type="button" data-testid={`create-role-${r}`} onClick={() => setForm({ ...form, role: r })} className={`chip ${form.role === r ? 'chip-on' : ''}`}>
              {t(`roles.${r}`)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-danger" data-testid="create-error">{error}</p>}
      <button type="submit" data-testid="create-submit" disabled={!valid || mut.isPending} className="btn-primary w-full disabled:opacity-40">
        {mut.isPending ? t('auth.working') : t('admin.createAccount')}
      </button>
    </form>
  );
}
