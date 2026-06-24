import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Sheet } from '@/components/Sheet';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients, saveClientProfile } from '@/services/platform/coachApi';
import { getCoachDashboard, type ClientDashboardRow } from '@/services/platform/coachDashboardApi';
import { createAccount } from '@/services/accounts/createUserSecondary';
import { linkCoachClient } from '@/services/platform/coachClientsApi';
import { passwordError } from '@/lib/password';
import { shortDate } from '@/lib/utils';
import type { AccountStatus, ActivityLevel, Goal } from '@/types';

const GOALS: Goal[] = ['muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'strength'];
const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const ACCT_PILL: Record<AccountStatus, string> = {
  active: 'border-success/50 text-success',
  pending: 'border-warn/50 text-warn',
  suspended: 'border-danger/50 text-danger',
  disabled: 'border-danger/50 text-danger',
};
// Coaches manage a simple Active / Frozen (suspended) / Trashed (disabled)
// lifecycle — 'pending' is an admin/signup state, not exposed here.
const STATUS_FILTERS: (AccountStatus | 'all')[] = ['all', 'active', 'suspended', 'disabled'];
const PAGE = 20;

export function CoachClients() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id);
  const isDesktop = useIsDesktop();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [visible, setVisible] = useState(PAGE);
  const [adding, setAdding] = useState(() => params.get('new') === '1');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ['myClients', coachId],
    queryFn: () => listMyClients(coachId!),
    enabled: !!coachId,
  });
  // Desktop CRM table needs adherence / assessment / last-activity per client —
  // reuse the dashboard aggregate (shared cache). Mobile never pays for it.
  const dash = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId && isDesktop,
    staleTime: 60_000,
  });

  const matches = (name: string, email: string, phone: string | undefined, q: string) =>
    (name || email).toLowerCase().includes(q) || email.toLowerCase().includes(q) || (phone ?? '').includes(q);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (clients.data ?? []).filter((c) => {
      if (statusFilter !== 'all' && c.accountStatus !== statusFilter) return false;
      return !q || matches(c.displayName || '', c.email, c.phone, q);
    });
  }, [clients.data, search, statusFilter]);

  const dashRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (dash.data?.clients ?? []).filter((r) => {
      if (statusFilter !== 'all' && r.client.accountStatus !== statusFilter) return false;
      return !q || matches(r.client.displayName || '', r.client.email, r.client.phone, q);
    });
  }, [dash.data, search, statusFilter]);

  // Reset the page window whenever the filter/search changes.
  useEffect(() => { setVisible(PAGE); }, [search, statusFilter]);
  const shown = filtered.slice(0, visible);
  const sentinel = useInfiniteScroll(() => setVisible((v) => v + PAGE), visible < filtered.length);

  const selected = dashRows.find((r) => r.client.id === selectedId) ?? null;

  const columns: Column<ClientDashboardRow>[] = [
    {
      key: 'client',
      header: t('coach.clients'),
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.client.displayName || r.client.email} photoUrl={r.client.photoUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{r.client.displayName || r.client.email}</span>
            <span className="block truncate text-[12px] text-earth-subtle">{r.client.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'status', header: t('subscription.accountTitle'), cell: (r) => <span className={`chip text-[11px] ${ACCT_PILL[r.client.accountStatus]}`}>{t(`subscription.acct.${r.client.accountStatus}`)}</span> },
    { key: 'assess', header: t('assessment.title'), cell: (r) => <span className="text-[12px] text-earth-subtle">{t(`assessment.status.${r.assessment}`)}</span> },
    { key: 'last', header: t('coachDash.recentActivity'), cell: (r) => <span className="text-[12px] text-earth-subtle">{r.lastActivity ? shortDate(r.lastActivity, i18n.language) : '—'}</span> },
    { key: 'adh', header: t('coach.adherence'), cell: (r) => <span className="font-mono text-sm">{r.workouts7d}<span className="text-earth-subtle"> /7d</span></span>, className: 'text-end' },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <button type="button" className="btn-ghost h-8 px-3 text-[11px]" onClick={(e) => { e.stopPropagation(); navigate(`/coach/client/${r.client.id}`); }}>
          {t('coachDash.open')}
        </button>
      ),
      className: 'text-end',
    },
  ];

  const searchBar = (
    <div className="relative mb-3">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
        <Icon name="search" size={18} />
      </span>
      <input className="input ps-10" data-testid="coach-clients-search" placeholder={t('coach.searchClients')} value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
  );
  const filterBar = (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {STATUS_FILTERS.map((s) => (
        <button key={s} type="button" data-testid={`client-status-filter-${s}`} onClick={() => setStatusFilter(s)} className={`chip whitespace-nowrap ${statusFilter === s ? 'chip-on' : ''}`}>
          {s === 'all' ? t('admin.allStatuses') : t(`subscription.acct.${s}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div data-testid="coach-clients">
      <TopBar
        title={t('coach.clients')}
        eyebrow={t('platform.coachPortal')}
        right={
          <div className="flex items-center gap-1.5">
            <button type="button" data-testid="coach-add-client" className="icon-btn h-[42px] w-[42px]" aria-label={t('coach.addClient')} onClick={() => setAdding(true)}>
              <Icon name="plus" size={20} />
            </button>
            <button type="button" className="icon-btn h-[42px] w-[42px] md:hidden" aria-label={t('platform.account')} onClick={() => navigate('/coach/settings')}>
              <Icon name="user" size={20} />
            </button>
          </div>
        }
      />

      {searchBar}
      {filterBar}

      {isDesktop ? (
        /* Desktop CRM master-detail */
        <div className="flex gap-5">
          <div className="min-w-0 flex-1">
            <DataTable
              testId="coach-desktop-clients"
              columns={columns}
              rows={dashRows}
              rowKey={(r) => r.client.id}
              selectedKey={selectedId}
              onRowClick={(r) => setSelectedId(r.client.id)}
              empty={dash.isLoading ? t('auth.working') : t('coach.noClients')}
            />
          </div>
          <div className="w-80 shrink-0">
            <DetailPanel testId="coach-desktop-preview" empty={!selected} emptyMessage={t('coachDash.selectClient')}>
              {selected && <ClientPreview row={selected} onOpen={() => navigate(`/coach/client/${selected.client.id}`)} onMessage={() => navigate(`/coach/messages/${selected.client.id}`)} />}
            </DetailPanel>
          </div>
        </div>
      ) : clients.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coach.noClients')}</div>
      ) : (
        <>
          <div className="card divide-y divide-line-soft">
            {shown.map((c) => (
              <button key={c.id} type="button" data-testid="coach-client-row" data-client-id={c.id} onClick={() => navigate(`/coach/client/${c.id}`)} className="row w-full text-start">
                <Avatar name={c.displayName || c.email} photoUrl={c.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.displayName || c.email}</span>
                  <span className="block truncate text-[13px] text-earth-muted">{c.email}</span>
                </span>
                <span className={`chip ${ACCT_PILL[c.accountStatus]}`}>{t(`subscription.acct.${c.accountStatus}`)}</span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
          <div ref={sentinel} />
          {visible < filtered.length && (
            <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setVisible((v) => v + PAGE)}>{t('common.showMore')}</button>
          )}
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('coach.addClient')}>
        <AddClientForm
          coachId={coachId ?? ''}
          onDone={() => {
            setAdding(false);
            void qc.invalidateQueries({ queryKey: ['myClients', coachId] });
            void qc.invalidateQueries({ queryKey: ['coachDashboard', coachId] });
          }}
        />
      </Sheet>
    </div>
  );
}

/** Desktop master-detail preview of the selected client. */
function ClientPreview({ row, onOpen, onMessage }: { row: ClientDashboardRow; onOpen: () => void; onMessage: () => void }) {
  const { t, i18n } = useTranslation();
  const c = row.client;
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar name={c.displayName || c.email} photoUrl={c.photoUrl} size="lg" />
        <div>
          <p className="font-semibold">{c.displayName || c.email}</p>
          <p className="text-[12px] text-earth-subtle">{c.email}</p>
        </div>
        <span className={`chip text-[11px] ${ACCT_PILL[c.accountStatus]}`}>{t(`subscription.acct.${c.accountStatus}`)}</span>
      </div>
      <div className="space-y-2 text-sm">
        <Row label={t('assessment.title')} value={t(`assessment.status.${row.assessment}`)} />
        <Row label={t('coach.adherence')} value={t('coachDash.workoutsThisWeek', { n: row.workouts7d })} />
        <Row label={t('coachDash.recentActivity')} value={row.lastActivity ? shortDate(row.lastActivity, i18n.language) : t('coachDash.neverActive')} />
        {c.phone && <Row label={t('settings.phone')} value={c.phone} />}
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" className="btn-primary w-full" onClick={onOpen}>{t('coachDash.open')}</button>
        <button type="button" className="btn-ghost w-full" onClick={onMessage}>{t('coach.messages')}</button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2">
      <span className="text-earth-subtle">{label}</span>
      <span className="text-end font-medium">{value}</span>
    </div>
  );
}

function AddClientForm({ coachId, onDone }: { coachId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    age: '',
    weight: '',
    height: '',
    goal: 'recomp' as Goal,
    activity: 'moderate' as ActivityLevel,
  });
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => Math.max(0, Number(s) || 0);

  const mut = useMutation({
    mutationFn: async () => {
      const record = await createAccount({
        email: form.email.trim(),
        password: form.password,
        displayName: form.name,
        phone: form.phone.trim() || undefined,
        role: 'client',
        accountStatus: 'active',
        createdBy: coachId,
        assignedCoachId: coachId,
      });
      await linkCoachClient(coachId, record.id, coachId);
      // Optional starting profile — best-effort; the client can complete it on
      // first login if left blank.
      try {
        await saveClientProfile(record.id, {
          id: record.id,
          name: form.name.trim(),
          age: num(form.age),
          weightKg: num(form.weight),
          heightCm: num(form.height),
          goal: form.goal,
          activityLevel: form.activity,
          locale: 'en',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch (e) {
        console.warn('[coach] initial profile not saved:', e);
      }
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof Error ? e.message : 'Failed'),
  });

  const valid = form.name.trim() && form.email.trim().length > 3 && form.phone.trim() && !passwordError(form.password);

  return (
    <form
      className="space-y-3"
      data-testid="coach-add-client-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (valid) mut.mutate();
      }}
    >
      <p className="text-sm text-earth-muted">{t('coach.addClientHint')}</p>
      <input className="input" data-testid="coach-add-name" placeholder={t('settings.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="input" type="email" autoComplete="off" data-testid="coach-add-email" placeholder={t('settings.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="input" type="password" autoComplete="new-password" data-testid="coach-add-password" placeholder={t('admin.tempPassword')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <input className="input" type="tel" inputMode="tel" autoComplete="off" data-testid="coach-add-phone" placeholder={t('settings.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <p className="text-[12px] text-earth-subtle">{t('auth.pwHint')}</p>

      <p className="label pt-1">{t('coach.profileOptional')}</p>
      <div className="grid grid-cols-3 gap-2">
        <input className="input" inputMode="numeric" placeholder={t('settings.age')} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
        <input className="input" inputMode="decimal" placeholder={`${t('settings.weight')} (${t('common.kg')})`} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
        <input className="input" inputMode="numeric" placeholder={`${t('settings.height')} (cm)`} value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
      </div>
      <select className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value as Goal })}>
        {GOALS.map((g) => (
          <option key={g} value={g}>{t(`settings.goals.${g}`)}</option>
        ))}
      </select>
      <select className="input" value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value as ActivityLevel })}>
        {ACTIVITIES.map((a) => (
          <option key={a} value={a}>{t(`settings.activities.${a}`)}</option>
        ))}
      </select>

      {error && <p className="text-sm text-danger" data-testid="coach-add-error">{error}</p>}
      <button type="submit" disabled={!valid || mut.isPending} data-testid="coach-add-submit" className="btn-primary w-full disabled:opacity-40">
        {mut.isPending ? t('auth.working') : t('coach.createClient')}
      </button>
    </form>
  );
}
