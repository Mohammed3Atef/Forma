import { useEffect, useMemo, useRef, useState } from 'react';
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
import { listMyClients } from '@/services/platform/coachApi';
import { getCoachDashboard, type ClientDashboardRow } from '@/services/platform/coachDashboardApi';
import { getCoachPlan } from '@/services/platform/coachPlanApi';
import { createInvite, listPendingInvites, revokeInvite, inviteLink } from '@/services/platform/inviteApi';
import { shortDate } from '@/lib/utils';
import type { AccountStatus, SignupInvite } from '@/types';

const ACCT_PILL: Record<AccountStatus, string> = {
  active: 'border-success/50 text-success',
  pending: 'border-warn/50 text-warn',
  suspended: 'border-danger/50 text-danger',
  disabled: 'border-danger/50 text-danger',
};
const STATUS_FILTERS: (AccountStatus | 'all')[] = ['all', 'active', 'suspended', 'disabled'];
const PAGE = 20;

export function CoachClients() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.id);
  const coachName = useSession((s) => s.account?.displayName ?? '');
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
  const dash = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId && isDesktop,
    staleTime: 60_000,
  });

  const plan = useQuery({
    queryKey: ['coachPlan', coachId],
    queryFn: () => getCoachPlan(coachId!),
    enabled: !!coachId,
    staleTime: 60_000,
  });
  const maxClients = plan.data?.maxClients ?? Infinity;
  const usedClients = plan.data?.activeClientCount ?? (clients.data?.filter((c) => c.accountStatus !== 'disabled').length ?? 0);
  const atLimit = Number.isFinite(maxClients) && usedClients >= maxClients;

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

      {Number.isFinite(maxClients) && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-line-soft px-3 py-2 text-[13px]" data-testid="coach-client-usage">
          <span className="text-earth-muted">{t('coachTrial.usage', { used: usedClients, max: maxClients })}</span>
          {atLimit && <span className="text-warn" data-testid="coach-client-limit">{t('coachTrial.limitReached')}</span>}
        </div>
      )}

      {searchBar}
      {filterBar}

      {isDesktop ? (
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
        {adding && <InvitePanel coachId={coachId ?? ''} coachName={coachName} atLimit={atLimit} maxClients={maxClients} />}
      </Sheet>
    </div>
  );
}

function InvitePanel({ coachId, coachName, atLimit, maxClients }: { coachId: string; coachName: string; atLimit: boolean; maxClients: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [prefill, setPrefill] = useState({ name: '', email: '', phone: '' });
  const [subPlan, setSubPlan] = useState<'trial' | 'pending' | '1m' | '3m'>('trial');
  const [price, setPrice] = useState('');
  // Invites generated in THIS session; on close, revoke any that weren't copied
  // (abandoned links) so stale links don't pile up. Copying a link = keep it.
  const generated = useRef<Set<string>>(new Set());
  const kept = useRef<Set<string>>(new Set());
  useEffect(() => () => {
    for (const code of generated.current) {
      if (!kept.current.has(code)) void revokeInvite(code).catch(() => undefined);
    }
  }, []);

  const pending = useQuery({
    queryKey: ['pendingInvites', coachId],
    queryFn: () => listPendingInvites(coachId),
    enabled: !!coachId,
  });

  const gen = useMutation({
    mutationFn: () => {
      const sub =
        subPlan === 'pending' ? { subStatus: 'pending' as const }
        : subPlan === '1m' ? { subStatus: 'active' as const, subMonths: 1 }
        : subPlan === '3m' ? { subStatus: 'active' as const, subMonths: 3 }
        : { subStatus: 'trial' as const, subTrialDays: 14 };
      return createInvite(coachId, {
        coachName,
        displayName: prefill.name.trim() || undefined,
        email: prefill.email.trim() || undefined,
        phone: prefill.phone.trim() || undefined,
        ...sub,
        ...(price.trim() ? { subPrice: Number(price) || undefined } : {}),
      });
    },
    onSuccess: (inv) => {
      generated.current.add(inv.code);
      setPrefill({ name: '', email: '', phone: '' });
      setPrice('');
      void qc.invalidateQueries({ queryKey: ['pendingInvites', coachId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (code: string) => revokeInvite(code),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pendingInvites', coachId] }),
  });

  const copy = async (code: string) => {
    const link = inviteLink(code);
    kept.current.add(code);
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      /* clipboard blocked — the link text is still visible to copy manually */
    }
  };

  return (
    <div className="space-y-4" data-testid="coach-invite-panel">
      <p className="text-sm text-earth-muted">{t('invite.panelHint')}</p>

      {atLimit ? (
        <p className="text-sm text-warn" data-testid="coach-invite-blocked">{t('coachTrial.limitBody', { max: maxClients })}</p>
      ) : (
        <div className="space-y-2">
          <input className="input" data-testid="coach-invite-name" placeholder={`${t('settings.name')} (${t('invite.optional')})`} value={prefill.name} onChange={(e) => setPrefill({ ...prefill, name: e.target.value })} />
          <input className="input" type="email" autoComplete="off" data-testid="coach-invite-email" placeholder={`${t('settings.email')} (${t('invite.optional')})`} value={prefill.email} onChange={(e) => setPrefill({ ...prefill, email: e.target.value })} />
          <input className="input" type="tel" inputMode="tel" autoComplete="off" data-testid="coach-invite-phone" placeholder={`${t('settings.phone')} (${t('invite.optional')})`} value={prefill.phone} onChange={(e) => setPrefill({ ...prefill, phone: e.target.value })} />
          <label className="label pt-1">{t('invite.subTitle')}</label>
          <select className="input" data-testid="coach-invite-sub" value={subPlan} onChange={(e) => setSubPlan(e.target.value as typeof subPlan)}>
            <option value="trial">{t('invite.subTrial')}</option>
            <option value="1m">{t('invite.sub1m')}</option>
            <option value="3m">{t('invite.sub3m')}</option>
            <option value="pending">{t('invite.subPending')}</option>
          </select>
          {subPlan !== 'pending' && (
            <input className="input" inputMode="decimal" data-testid="coach-invite-price" placeholder={t('invite.priceOptional')} value={price} onChange={(e) => setPrice(e.target.value)} />
          )}
          <button type="button" data-testid="coach-invite-generate" className="btn-primary w-full disabled:opacity-40" disabled={gen.isPending} onClick={() => gen.mutate()}>
            {gen.isPending ? t('auth.working') : t('invite.generate')}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="label">{t('invite.pending')}</p>
        {pending.isLoading ? (
          <p className="text-sm text-earth-muted">{t('auth.working')}</p>
        ) : (pending.data ?? []).length === 0 ? (
          <p className="text-sm text-earth-subtle" data-testid="coach-invite-empty">{t('invite.none')}</p>
        ) : (
          <div className="card divide-y divide-line-soft">
            {(pending.data ?? []).map((inv: SignupInvite) => (
              <div key={inv.code} className="flex items-center gap-2 px-3 py-2.5" data-testid="coach-invite-row" data-code={inv.code}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm">{inv.code}</span>
                  <span className="block truncate text-[11px] text-earth-subtle">{inv.displayName || inviteLink(inv.code)}</span>
                </span>
                <button type="button" data-testid="coach-invite-copy" className="btn-ghost h-8 px-3 text-[11px]" onClick={() => void copy(inv.code)}>
                  {copied === inv.code ? t('invite.copied') : t('invite.copy')}
                </button>
                <button type="button" data-testid="coach-invite-revoke" className="btn-ghost h-8 px-3 text-[11px] text-danger" onClick={() => revoke.mutate(inv.code)}>
                  {t('invite.revoke')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
