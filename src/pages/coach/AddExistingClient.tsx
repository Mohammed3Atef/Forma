import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SearchField, TextAreaField } from '@/components/ui/Field';
import { SubscriptionPlanPicker, type PlanPickResult } from '@/components/coach/SubscriptionPlanPicker';
import { searchClients, fetchUser } from '@/services/platform/accountsApi';
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
import type { CoachClientRelationship, UserRecord } from '@/types';

/** Format a millisecond timestamp as a short localized date (joined date). */
const fmtJoined = (ms: number, lang: string) =>
  new Date(ms).toLocaleDateString(lang.startsWith('ar') ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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

/** One search result, with its current coaching assignment resolved (no ids exposed). */
interface ResultRow {
  user: UserRecord;
  coachId: string | null;
  coachName: string | null;
  rel: CoachClientRelationship | null;
}

/**
 * "Add Existing Client" — search an existing Forma client by email / phone / name
 * and assign or request a transfer. NEVER creates a new account or Auth user.
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
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [term, setTerm] = useState(''); // submitted query
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ['existingClientSearch', term],
    enabled: term.trim().length > 0,
    queryFn: async (): Promise<ResultRow[]> => {
      const users = await searchClients(term.trim());
      const assignments = await Promise.all(users.map((u) => getClientAssignment(u.id).catch(() => null)));
      // Resolve coach display names once (dedupe).
      const coachIds = Array.from(new Set(assignments.map((a) => a?.coachId).filter(Boolean) as string[]));
      const coachMap = new Map<string, string>();
      await Promise.all(
        coachIds.map(async (cid) => {
          const c = await fetchUser(cid).catch(() => null);
          if (c) coachMap.set(cid, c.displayName || c.email);
        }),
      );
      return users.map((user, i) => {
        const a = assignments[i];
        return { user, coachId: a?.coachId ?? null, coachName: a ? coachMap.get(a.coachId) ?? null : null, rel: a?.rel ?? null };
      });
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
        atLimit={atLimit}
        maxClients={maxClients}
        onDone={onDone}
        i18nLang={i18n.language}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="add-existing-panel">
      <p className="text-sm text-earth-muted">{t('existing.hint')}</p>

      <div className="flex gap-2">
        <SearchField
          fieldClassName="flex-1"
          aria-label={t('existing.search')}
          data-testid="existing-search"
          placeholder={t('existing.searchPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button type="button" data-testid="existing-search-btn" className="btn-primary px-4 disabled:opacity-40" disabled={!text.trim()} onClick={submit}>
          {t('existing.search')}
        </button>
      </div>

      {!term.trim() ? (
        <p className="py-8 text-center text-sm text-earth-subtle" data-testid="existing-empty">{t('existing.emptyState')}</p>
      ) : results.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted" data-testid="existing-searching">{t('existing.searching')}</p>
      ) : rows.length === 0 ? (
        <div className="card space-y-3 py-8 text-center" data-testid="existing-no-account">
          <p className="text-sm text-earth-muted">{t('existing.noAccount')}</p>
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
                <Avatar name={r.user.displayName || r.user.email} photoUrl={r.user.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.user.displayName || r.user.email}</span>
                  <span className="block truncate text-[13px] text-earth-muted">{r.user.email}</span>
                  <span className="block truncate text-[11px] text-earth-subtle">
                    {r.coachName ? t('existing.coachedBy', { name: r.coachName }) : t('existing.unassigned')}
                  </span>
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

function ClientResultDetail({
  row,
  meId,
  atLimit,
  maxClients,
  onDone,
  i18nLang,
}: {
  row: ResultRow;
  meId: string;
  atLimit: boolean;
  maxClients: number;
  onDone: () => void;
  i18nLang: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const c = row.user;
  const mine = row.coachId === meId;
  const ownedByOther = !!row.coachId && row.coachId !== meId;
  const unassigned = !row.coachId;

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
      onDone();
    },
  });

  const request = useMutation({
    mutationFn: () => submitTransferRequest({ toCoachId: meId, clientId: c.id, fromCoachId: row.coachId!, reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['transferReq', meId, c.id] }),
  });
  const cancelReq = useMutation({
    mutationFn: () => cancelTransferRequest(meId, c.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['transferReq', meId, c.id] }),
  });
  // A coach who somehow lands on their own client can release them straight from here.
  const release = useMutation({
    mutationFn: () => releaseClient(meId, c.id, meId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['myClients', meId] });
      void qc.invalidateQueries({ queryKey: ['coachDashboard', meId] });
      onDone();
    },
  });

  const pendingReq = myReq.data && myReq.data.status === 'pending' ? myReq.data : null;

  return (
    <div className="space-y-4" data-testid="existing-detail">
      {/* Result card — never shows technical ids. */}
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={c.displayName || c.email} photoUrl={c.photoUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{c.displayName || c.email}</p>
            <p className="truncate text-[12px] text-earth-subtle">{c.email}</p>
            {c.phone && <p className="truncate text-[12px] text-earth-subtle">{c.phone}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <Field label={t('existing.currentCoach')} value={row.coachName ?? t('existing.unassigned')} />
          <Field label={t('subscription.accountTitle')} value={t(`subscription.acct.${c.accountStatus}`)} tone={ACCT_TONE[c.accountStatus]} />
          <Field label={t('existing.subscription')} value={row.rel?.subscription ? t(`subscription.status.${row.rel.subscription.status}`) : '—'} tone={row.rel?.subscription ? SUB_TONE[row.rel.subscription.status] : undefined} />
          <Field label={t('existing.joined')} value={fmtJoined(c.createdAt, i18nLang)} />
        </div>
      </div>

      {/* ALREADY MINE */}
      {mine && (
        <div className="space-y-2" data-testid="existing-already-assigned">
          <p className="text-sm text-earth-muted">{t('existing.alreadyYours')}</p>
          <button type="button" className="btn-ghost w-full text-danger" data-testid="existing-release" disabled={release.isPending} onClick={() => release.mutate()}>
            {release.isPending ? t('auth.working') : t('release.action')}
          </button>
        </div>
      )}

      {/* CASE 1 — unassigned → assign with a required subscription */}
      {unassigned && (
        <div className="space-y-2" data-testid="existing-assign-panel">
          {atLimit ? (
            <p className="text-sm text-warn" data-testid="existing-assign-blocked">{t('coachTrial.limitBody', { max: maxClients })}</p>
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
          <p className="text-sm text-earth-muted">{t('existing.ownedByOther', { name: row.coachName ?? '' })}</p>
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
