import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { SubscriptionPlanPicker, type PlanPickResult } from '@/components/coach/SubscriptionPlanPicker';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import { getCoachDashboard, type ClientDashboardRow } from '@/services/platform/coachDashboardApi';
import { getRelationship } from '@/services/platform/coachClientsApi';
import { getCoachPlan } from '@/services/platform/coachPlanApi';
import { effectiveSubscriptionStatus, subscriptionDaysLeft } from '@/lib/subscription';
import { createInvite, listPendingInvites, revokeInvite, inviteLink } from '@/services/platform/inviteApi';
import { AddExistingClient } from '@/pages/coach/AddExistingClient';
import { IncomingTransferRequests } from '@/components/coach/IncomingTransferRequests';
import { useCoachPlan } from '@/components/coach/CoachPlanProvider';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { shortDate } from '@/lib/utils';
import type { AccountStatus, SignupInvite } from '@/types';

type AddMode = 'choose' | 'create' | 'existing';

const ACCT_PILL: Record<AccountStatus, string> = {
  active: 'border-success/50 text-success',
  pending: 'border-warn/50 text-warn',
  suspended: 'border-danger/50 text-danger',
  disabled: 'border-danger/50 text-danger',
};
const SUB_PILL: Record<string, string> = {
  none: 'border-line text-earth-subtle',
  trial: 'border-brand/50 text-brand',
  active: 'border-success/50 text-success',
  pending: 'border-warn/50 text-warn',
  frozen: 'border-warn/50 text-warn',
  expired: 'border-danger/50 text-danger',
  cancelled: 'border-danger/50 text-danger',
  ended: 'border-danger/50 text-danger',
};
const STATUS_FILTERS: (AccountStatus | 'all')[] = ['all', 'active', 'suspended', 'disabled'];
const PAGE = 20;

export function CoachClients() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.id);
  const coachName = useSession((s) => s.account?.displayName ?? '');
  const isDesktop = useIsDesktop();
  const { canWrite } = useCoachPlan(); // false when the coach's own plan has lapsed
  const online = useOnlineStatus(); // adding a client writes to Firestore — needs connectivity
  useFullBleed();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'all'>('all');
  const [visible, setVisible] = useState(PAGE);
  const [adding, setAdding] = useState(() => params.get('new') === '1');
  const [addMode, setAddMode] = useState<AddMode>('choose');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Single back affordance for the Add-Client sheet. The "existing" sub-flow
  // registers a context-aware handler (detail → search list); when it's null we
  // fall back to returning to the chooser. Keeps ONE back control in the header.
  const [existingBack, setExistingBack] = useState<(() => void) | null>(null);

  const openAdd = () => { setAddMode('choose'); setAdding(true); };

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
  // Prefer the REAL client count — the maintained plan counter can drift out of sync.
  const usedClients = clients.data
    ? clients.data.filter((c) => c.accountStatus !== 'disabled').length
    : plan.data?.activeClientCount ?? 0;
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
    { key: 'added', header: t('coachDash.added'), cell: (r) => <span className="text-[12px] text-earth-subtle">{shortDate(new Date(r.addedAt).toISOString().slice(0, 10), i18n.language)}</span> },
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
            <button type="button" data-testid="coach-add-client" className="icon-btn h-[42px] w-[42px]" aria-label={t('coach.addClient')} disabled={!canWrite || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={openAdd}>
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

      {coachId && <IncomingTransferRequests coachId={coachId} />}

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
              {selected && <ClientPreview row={selected} coachId={coachId ?? ''} onOpen={() => navigate(`/coach/client/${selected.client.id}`)} onMessage={() => navigate(`/coach/messages/${selected.client.id}`)} />}
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

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        size="lg"
        title={addMode === 'create' ? t('existing.createNewTitle') : addMode === 'existing' ? t('existing.title') : t('coach.addClient')}
        onBack={
          addMode === 'choose'
            ? undefined
            : addMode === 'existing'
              ? existingBack ?? (() => setAddMode('choose'))
              : () => setAddMode('choose')
        }
        backTestId={addMode === 'existing' && existingBack ? 'existing-back' : 'add-mode-back'}
      >
        {adding && addMode === 'choose' && (
          <AddChooser onCreate={() => setAddMode('create')} onExisting={() => setAddMode('existing')} />
        )}
        {adding && addMode === 'create' && <InvitePanel coachId={coachId ?? ''} coachName={coachName} atLimit={atLimit} maxClients={maxClients} />}
        {adding && addMode === 'existing' && (
          <AddExistingClient
            coachId={coachId ?? ''}
            atLimit={atLimit}
            maxClients={maxClients}
            onCreateNew={() => setAddMode('create')}
            onDone={() => { setAdding(false); void clients.refetch(); }}
            registerBack={setExistingBack}
          />
        )}
      </Sheet>
    </div>
  );
}

/** First screen of the Add-Client sheet: choose how to add this client. */
function AddChooser({ onCreate, onExisting }: { onCreate: () => void; onExisting: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3" data-testid="add-client-chooser">
      <p className="text-sm text-earth-muted">{t('existing.chooserHint')}</p>
      <button type="button" data-testid="add-choose-create" className="card flex w-full items-center gap-3 text-start hover:border-brand/40" onClick={onCreate}>
        <span className="row-av h-10 w-10 shrink-0 bg-brand/15 text-brand"><Icon name="plus" size={18} /></span>
        <span className="min-w-0">
          <span className="block font-medium">{t('existing.createNew')}</span>
          <span className="block text-[12px] text-earth-subtle">{t('existing.createNewDesc')}</span>
        </span>
      </button>
      <button type="button" data-testid="add-choose-existing" className="card flex w-full items-center gap-3 text-start hover:border-brand/40" onClick={onExisting}>
        <span className="row-av h-10 w-10 shrink-0 bg-brand/15 text-brand"><Icon name="search" size={18} /></span>
        <span className="min-w-0">
          <span className="block font-medium">{t('existing.addExisting')}</span>
          <span className="block text-[12px] text-earth-subtle">{t('existing.addExistingDesc')}</span>
        </span>
      </button>
    </div>
  );
}

function InvitePanel({ coachId, coachName, atLimit, maxClients }: { coachId: string; coachName: string; atLimit: boolean; maxClients: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [prefill, setPrefill] = useState({ name: '', email: '', phone: '' });
  const currency = useSession((s) => s.account?.currency) ?? 'EGP';
  const [sub, setSub] = useState<PlanPickResult>({ status: 'trial', trialDays: 14 });
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
    // Always refetch when the Add-client sheet (re)opens so links a client has
    // already claimed drop out of the list instead of lingering.
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const gen = useMutation({
    mutationFn: () =>
      createInvite(coachId, {
        coachName,
        displayName: prefill.name.trim() || undefined,
        email: prefill.email.trim() || undefined,
        phone: prefill.phone.trim() || undefined,
        subStatus: sub.status,
        ...(sub.months != null ? { subMonths: sub.months } : {}),
        ...(sub.days != null ? { subDays: sub.days } : {}),
        ...(sub.trialDays != null ? { subTrialDays: sub.trialDays } : {}),
        ...(sub.price != null ? { subPrice: sub.price, subCurrency: currency } : {}),
        ...(sub.planName ? { subPlanName: sub.planName } : {}),
      }),
    onSuccess: (inv) => {
      generated.current.add(inv.code);
      setPrefill({ name: '', email: '', phone: '' });
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
          <TextInput label={t('field.name')} data-testid="coach-invite-name" placeholder={t('invite.optional')} value={prefill.name} onChange={(e) => setPrefill({ ...prefill, name: e.target.value })} />
          <TextInput label={t('field.email')} type="email" autoComplete="off" data-testid="coach-invite-email" placeholder={t('invite.optional')} value={prefill.email} onChange={(e) => setPrefill({ ...prefill, email: e.target.value })} />
          <TextInput label={t('field.phone')} type="tel" inputMode="tel" autoComplete="off" data-testid="coach-invite-phone" placeholder={t('invite.optional')} value={prefill.phone} onChange={(e) => setPrefill({ ...prefill, phone: e.target.value })} />
          <SubscriptionPlanPicker coachId={coachId} currency={currency} onChange={setSub} testId="coach-invite-sub" />
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
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm">{inv.code}</span>
                    <span className="chip border-warn/50 px-2 py-0.5 text-[10px] text-warn">{t('invite.statusPending')}</span>
                  </span>
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

function ClientPreview({ row, coachId, onOpen, onMessage }: { row: ClientDashboardRow; coachId: string; onOpen: () => void; onMessage: () => void }) {
  const { t, i18n } = useTranslation();
  const c = row.client;
  const rel = useQuery({
    queryKey: ['relationship', coachId, c.id],
    queryFn: () => getRelationship(coachId, c.id),
    enabled: !!coachId && !!c.id,
  });
  const sub = rel.data?.subscription;
  const subStatus = effectiveSubscriptionStatus(sub);
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
        <Row label={t('subscription.title')}>
          <span className="flex items-center gap-2">
            <span data-testid="preview-sub-status" className={`chip text-[11px] ${SUB_PILL[subStatus]}`}>{t(`subscription.status.${subStatus}`)}</span>
            {sub && subStatus !== 'ended' && (
              <span className="font-mono text-[11px] text-earth-subtle">{t('subscription.daysLeft', { n: subscriptionDaysLeft(sub) })}</span>
            )}
          </span>
        </Row>
        <Row label={t('assessment.title')}>{t(`assessment.status.${row.assessment}`)}</Row>
        <Row label={t('coach.adherence')}>{t('coachDash.workoutsThisWeek', { n: row.workouts7d })}</Row>
        <Row label={t('coachDash.recentActivity')}>{row.lastActivity ? shortDate(row.lastActivity, i18n.language) : t('coachDash.neverActive')}</Row>
        <Row label={t('coachDash.added')}>{shortDate(new Date(row.addedAt).toISOString().slice(0, 10), i18n.language)}</Row>
        {c.phone && <Row label={t('settings.phone')}>{c.phone}</Row>}
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" className="btn-primary w-full" onClick={onOpen}>{t('coachDash.open')}</button>
        <button type="button" className="btn-ghost w-full" onClick={onMessage}>{t('coach.messages')}</button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2">
      <span className="shrink-0 text-earth-subtle">{label}</span>
      <span className="min-w-0 text-end font-medium">{children}</span>
    </div>
  );
}
