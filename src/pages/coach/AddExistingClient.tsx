import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SearchField, TextAreaField } from '@/components/ui/Field';
import { SubscriptionPlanPicker, type PlanPickResult } from '@/components/coach/SubscriptionPlanPicker';
import { searchClients, type ClientLookup } from '@/services/platform/accountsApi';
import {
  assignExistingClient,
  getClientAssignment,
  releaseClient,
} from '@/services/platform/coachClientsApi';
import {
  cancelTransferRequest,
  getTransferRequest,
  submitTransferRequest,
} from '@/services/platform/transferApi';
import { useSession } from '@/services/auth/sessionStore';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { CoachClientRelationship } from '@/types';
import { ClientCapBlocked } from '@/components/coach/ClientCapBlocked';
import { commercialErrorMessage } from '@/lib/commercialErrors';

/** Text-colour tone per account status (rendered as a coloured dot + label, not a chip). */
const ACCT_TONE: Record<string, string> = {
  active: 'text-success',
  pending: 'text-warn',
  suspended: 'text-danger',
  disabled: 'text-danger',
};
/** Text-colour tone per subscription status. */
const SUB_TONE: Record<string, string> = {
  trial: 'text-brand',
  active: 'text-success',
  pending: 'text-warn',
  expired: 'text-danger',
  cancelled: 'text-danger',
  frozen: 'text-warn',
  ended: 'text-danger',
};

/** One lookup result; `rel` is only ever OUR OWN relationship (the server never says who else coaches them). */
interface ResultRow {
  user: ClientLookup;
  rel: CoachClientRelationship | null;
}

/**
 * "Add Existing Client" — find an existing Forma client by their EXACT email or
 * phone (B0 / CO-03) and assign or request a transfer. NEVER creates a new
 * account or Auth user.
 */
export function AddExistingClient({
  coachId,
  atLimit,
  maxClients,
  onCreateNew,
  onDone,
  registerBack,
}: {
  coachId: string;
  atLimit: boolean;
  maxClients: number;
  onCreateNew: () => void;
  onDone: () => void;
  /** Report the current back handler to the parent sheet (null = at list root). */
  registerBack: (fn: (() => void) | null) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [term, setTerm] = useState(''); // submitted query
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ['existingClientSearch', coachId, term],
    enabled: term.trim().length > 0,
    queryFn: async (): Promise<ResultRow[]> => {
      const users = await searchClients(term.trim());
      // Only OUR OWN relationship is read (allowed); another coach's is never exposed.
      return Promise.all(
        users.map(async (user) => {
          if (user.coaching !== 'you') return { user, rel: null };
          const mine = await getClientAssignment(user.id).catch((e) => {
            console.warn('[AddExistingClient] own relationship read failed:', e);
            return null;
          });
          return { user, rel: mine?.rel ?? null };
        }),
      );
    },
  });

  const rows = results.data ?? [];
  const selected = useMemo(() => rows.find((r) => r.user.id === selectedId) ?? null, [rows, selectedId]);
  // Auto-open the single match; a multi-result set always shows the list first.
  const single = rows.length === 1 ? rows[0] : null;
  const detail = selected ?? single;

  const submit = () => {
    setSelectedId(null);
    setTerm(text);
  };

  const detailId = detail?.user.id ?? null;
  const singleId = single?.user.id ?? null;
  const rowCount = rows.length;
  // Report a context-aware back handler to the parent sheet: from a result
  // detail, back returns to the search list; at the list root we report null so
  // the parent falls back to the chooser. Keeps ONE back control in the header.
  useEffect(() => {
    if (!detailId) {
      registerBack(null);
      return;
    }
    registerBack(() => () => {
      setSelectedId(null);
      if (singleId && rowCount === 1) setTerm('');
    });
    return () => registerBack(null);
  }, [detailId, singleId, rowCount, registerBack]);

  if (detail) {
    return (
      <ClientResultDetail
        row={detail}
        meId={coachId}
        searched={term.trim()}
        atLimit={atLimit}
        maxClients={maxClients}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="add-existing-panel">
      <p className="text-sm text-earth-muted">{t('trust.existing.hint')}</p>

      <div className="flex gap-2">
        <SearchField
          fieldClassName="flex-1"
          aria-label={t('existing.search')}
          data-testid="existing-search"
          placeholder={t('trust.existing.searchPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button type="button" data-testid="existing-search-btn" className="btn-primary px-4 disabled:opacity-40" disabled={!text.trim()} onClick={submit}>
          {t('existing.search')}
        </button>
      </div>

      {!term.trim() ? (
        <p className="py-8 text-center text-sm text-earth-subtle" data-testid="existing-empty">{t('trust.existing.emptyState')}</p>
      ) : results.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted" data-testid="existing-searching">{t('existing.searching')}</p>
      ) : results.isError ? (
        <div className="card space-y-3 py-6 text-center" role="alert" data-testid="existing-search-error">
          <p className="text-sm text-danger">
            {(results.error as { data?: { code?: string } } | null)?.data?.code === 'TOO_MANY_REQUESTS' ? t('trust.existing.tooMany') : t('trust.existing.searchFailed')}
          </p>
          <button type="button" className="btn-ghost w-full" onClick={() => void results.refetch()}>{t('common.retry')}</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card space-y-3 py-8 text-center" data-testid="existing-no-account">
          <p className="text-sm text-earth-muted">{t('trust.existing.noAccount')}</p>
          <div className="flex flex-col gap-2">
            <button type="button" className="btn-primary w-full" data-testid="existing-create-new" onClick={onCreateNew}>{t('existing.createNew')}</button>
            <button type="button" className="btn-ghost w-full" onClick={() => setTerm('')}>{t('existing.searchAgain')}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="label">{t('existing.resultsCount', { n: rows.length })}</p>
          <div className="card divide-y divide-line-soft">
            {rows.map((r) => (
              <button
                key={r.user.id}
                type="button"
                data-testid="existing-result"
                data-client-id={r.user.id}
                onClick={() => setSelectedId(r.user.id)}
                className="row w-full text-start"
              >
                <Avatar name={r.user.displayName || term} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.user.displayName || term}</span>
                  <span className="block truncate text-[11px] text-earth-subtle">{coachingLabel(r.user.coaching, t)}</span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function coachingLabel(c: ClientLookup['coaching'], t: (k: string) => string): string {
  return c === 'you' ? t('existing.alreadyYours') : c === 'another' ? t('trust.existing.hasCoach') : t('existing.unassigned');
}

function ClientResultDetail({
  row,
  meId,
  searched,
  atLimit,
  maxClients,
  onDone,
}: {
  row: ResultRow;
  meId: string;
  /** The exact email/phone the coach typed — echoed back instead of any stored contact data. */
  searched: string;
  atLimit: boolean;
  maxClients: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const c = row.user;
  const mine = c.coaching === 'you';
  const ownedByOther = c.coaching === 'another';
  const unassigned = c.coaching === 'none';

  const currency = useSession((s) => s.account?.currency) ?? 'EGP';
  const [sub, setSub] = useState<PlanPickResult>({ status: 'trial', trialDays: 14 });
  const [reason, setReason] = useState('');

  // Existing outgoing request to take THIS client (if any).
  const myReq = useQuery({
    queryKey: ['transferReq', meId, c.id],
    enabled: ownedByOther,
    queryFn: () => getTransferRequest(meId, c.id),
  });

  const assign = useMutation({
    mutationFn: () => assignExistingClient(meId, c.id, meId, { ...sub, ...(currency ? { currency } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['myClients', meId] });
      void qc.invalidateQueries({ queryKey: ['coachDashboard', meId] });
      void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries', meId] });
      void qc.invalidateQueries({ queryKey: ['coachRelationships', meId] });
      showToast({ title: t('coach.addClient'), variant: 'success' });
      onDone();
    },
    onError: (e) => void alertDialog({ title: t('coach.addClient'), message: commercialErrorMessage(e, t) }),
  });

  const request = useMutation({
    mutationFn: () => submitTransferRequest({ toCoachId: meId, clientId: c.id, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transferReq', meId, c.id] });
      void qc.invalidateQueries({ queryKey: ['outgoingTransferRequests', meId] });
      showToast({ title: t('transferReq.pending'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('transferReq.request'), message: commercialErrorMessage(e, t) }),
  });
  const cancelReq = useMutation({
    mutationFn: () => cancelTransferRequest(meId, c.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transferReq', meId, c.id] });
      void qc.invalidateQueries({ queryKey: ['outgoingTransferRequests', meId] });
    },
    onError: (e) => void alertDialog({ title: t('transferReq.cancel'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  // A coach who somehow lands on their own client can release them straight from here.
  const release = useMutation({
    mutationFn: () => releaseClient(meId, c.id, meId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['myClients', meId] });
      void qc.invalidateQueries({ queryKey: ['coachDashboard', meId] });
      void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries', meId] });
      void qc.invalidateQueries({ queryKey: ['coachRelationships', meId] });
      showToast({ title: t('common.removed'), variant: 'success' });
      onDone();
    },
    onError: (e) => void alertDialog({ title: t('release.confirm'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });

  const pendingReq = myReq.data && myReq.data.status === 'pending' ? myReq.data : null;

  return (
    <div className="space-y-4" data-testid="existing-detail">
      {/* Result card — only what the add/transfer decision needs (no contact data, no ids). */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={c.displayName || searched} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{c.displayName || searched}</p>
            <p className="truncate text-[12px] text-earth-subtle">{t('trust.existing.searchedFor')}: <span dir="ltr">{searched}</span></p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Field label={t('existing.currentCoach')} value={mine ? t('trust.existing.coachYou') : ownedByOther ? t('trust.existing.coachAnother') : t('existing.unassigned')} />
          {c.accountStatus && <Field label={t('subscription.accountTitle')} value={t(`subscription.acct.${c.accountStatus}`)} tone={ACCT_TONE[c.accountStatus]} />}
          {mine && <Field label={t('existing.subscription')} value={row.rel?.subscription ? t(`subscription.status.${row.rel.subscription.status}`) : '—'} tone={row.rel?.subscription ? SUB_TONE[row.rel.subscription.status] : undefined} />}
        </div>
      </div>

      {/* ALREADY MINE */}
      {mine && (
        <div className="space-y-2" data-testid="existing-already-assigned">
          <p className="text-sm text-earth-muted">{t('existing.alreadyYours')}</p>
          <button
            type="button"
            className="btn-ghost w-full text-danger"
            data-testid="existing-release"
            disabled={release.isPending}
            onClick={async () => {
              const ok = await confirmDialog({ title: t('release.title'), message: t('release.body'), confirmLabel: t('release.confirm'), danger: true });
              if (ok) release.mutate();
            }}
          >
            {release.isPending ? t('auth.working') : t('release.action')}
          </button>
        </div>
      )}

      {/* CASE 1 — unassigned → assign with a required subscription */}
      {unassigned && (
        <div className="space-y-2" data-testid="existing-assign-panel">
          {atLimit ? (
            <ClientCapBlocked maxClients={maxClients} testId="existing-assign-blocked" />
          ) : (
            <>
              <SubscriptionPlanPicker coachId={meId} currency={currency} onChange={setSub} testId="existing-assign-sub" />
              <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="existing-assign" disabled={assign.isPending} onClick={() => assign.mutate()}>
                {assign.isPending ? t('auth.working') : t('existing.assignToMe')}
              </button>
            </>
          )}
        </div>
      )}

      {/* CASE 2 — owned by another coach → request transfer / wait */}
      {ownedByOther && (
        <div className="space-y-2" data-testid="existing-transfer-panel">
          <p className="text-sm text-earth-muted">{t('trust.existing.ownedByOther')}</p>
          {pendingReq ? (
            <div className="space-y-2">
              <p className="chip border-warn/50 text-warn">{t('transferReq.pending')}</p>
              <p className="text-[13px] text-earth-subtle">{t('existing.waitUntilReleased')}</p>
              <button type="button" className="btn-ghost w-full" data-testid="existing-transfer-cancel" disabled={cancelReq.isPending} onClick={() => cancelReq.mutate()}>
                {t('transferReq.cancel')}
              </button>
            </div>
          ) : (
            <>
              <TextAreaField
                label={t('field.reason')}
                required
                helper={t('transferReq.reasonRequiredHint')}
                className="min-h-[72px]"
                data-testid="existing-transfer-reason"
                placeholder={t('transferReq.reasonPlaceholder')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="existing-request-transfer" disabled={request.isPending || !reason.trim()} onClick={() => request.mutate()}>
                {request.isPending ? t('auth.working') : t('transferReq.request')}
              </button>
              <p className="text-[12px] text-earth-subtle">{t('existing.waitUntilReleased')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line-soft px-2.5 py-1.5">
      <p className="text-[11px] text-earth-subtle">{label}</p>
      <p className={`mt-0.5 flex items-center gap-1.5 font-medium ${tone ?? ''}`}>
        {tone && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
