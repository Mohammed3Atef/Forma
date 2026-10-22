import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { SubscriptionPlanPicker, type PlanPickResult } from '@/components/coach/SubscriptionPlanPicker';
import { ClientCapBlocked } from '@/components/coach/ClientCapBlocked';
import { createInvite, listPendingInvites, revokeInvite, inviteLink } from '@/services/platform/inviteApi';
import { AddExistingClient } from '@/pages/coach/AddExistingClient';
import { commercialErrorMessage } from '@/lib/commercialErrors';
import { formatDate } from '@/lib/format';
import { alertDialog } from '@/stores/dialogStore';
import type { SignupInvite } from '@/types';
import { useWriteGate } from '@/components/coach/CoachPlanProvider';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import { errorMessage } from '@/lib/errorMessage';

export type AddMode = 'choose' | 'create' | 'existing';

/**
 * Add client (B3.3, owner O-3): one sheet with both ways in — **Invite a new
 * client** and **Add an existing Forma client** — moved out of the Clients
 * page unchanged (same steps, test ids, capacity blocks and B0 lookup rules).
 * One change (owner O-4 / CO-37): invites are never revoked when the sheet
 * closes; only an explicit Revoke (or expiry) ends one.
 */
export function AddClientSheet({
  open,
  mode,
  onMode,
  onClose,
  onAdded,
  coachId,
  coachName,
  atLimit,
  maxClients,
}: {
  open: boolean;
  mode: AddMode;
  onMode: (m: AddMode) => void;
  onClose: () => void;
  /** An existing client was assigned — the roster should refetch. */
  onAdded: () => void;
  coachId: string;
  coachName: string;
  atLimit: boolean;
  maxClients: number;
}) {
  const { t } = useTranslation();
  // Single back affordance: the "existing" sub-flow registers a context-aware handler (detail → search list).
  const [existingBack, setExistingBack] = useState<(() => void) | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={mode === 'create' ? t('existing.createNewTitle') : mode === 'existing' ? t('existing.title') : t('coach.addClient')}
      onBack={mode === 'choose' ? undefined : mode === 'existing' ? existingBack ?? (() => onMode('choose')) : () => onMode('choose')}
      backTestId={mode === 'existing' && existingBack ? 'existing-back' : 'add-mode-back'}
    >
      {open && mode === 'choose' && <AddChooser onCreate={() => onMode('create')} onExisting={() => onMode('existing')} />}
      {open && mode === 'create' && <InvitePanel coachId={coachId} coachName={coachName} atLimit={atLimit} maxClients={maxClients} />}
      {open && mode === 'existing' && (
        <AddExistingClient
          coachId={coachId}
          atLimit={atLimit}
          maxClients={maxClients}
          onCreateNew={() => onMode('create')}
          onDone={() => {
            onClose();
            onAdded();
          }}
          registerBack={setExistingBack}
        />
      )}
    </Sheet>
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
          <span className="block text-[12px] text-earth-subtle">{t('trust.existing.addExistingDesc')}</span>
        </span>
      </button>
    </div>
  );
}

function InvitePanel({ coachId, coachName, atLimit, maxClients }: { coachId: string; coachName: string; atLimit: boolean; maxClients: number }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [prefill, setPrefill] = useState({ name: '', email: '', phone: '' });
  const [sub, setSub] = useState<PlanPickResult>({ status: 'trial', trialDays: 14 });
  // O-4 (owner, B3.3): an invite stays pending until the coach revokes it or it expires —
  // closing the sheet never revokes anything (it used to silently revoke uncopied links, CO-37).

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
  // B3.9 (C2): a new invite is a coach write (plan + connection, as the server enforces); withdrawing one
  // stays allowed on a lapsed plan (it protects the client) but needs the connection. Offline / failed
  // reads of the pending list are said, never a false "no invites".
  const gate = useWriteGate();
  const online = useOnlineStatus();
  const pendingScreen = useQueryScreen(pending);

  const gen = useMutation({
    mutationFn: async () => {
      return createInvite(coachId, {
        coachName,
        displayName: prefill.name.trim() || undefined,
        email: prefill.email.trim() || undefined,
        phone: prefill.phone.trim() || undefined,
        subStatus: sub.status,
        ...(sub.months != null ? { subMonths: sub.months } : {}),
        ...(sub.days != null ? { subDays: sub.days } : {}),
        ...(sub.trialDays != null ? { subTrialDays: sub.trialDays } : {}),
        ...(sub.price != null ? { subPrice: sub.price } : {}),
        ...(sub.planName ? { subPlanName: sub.planName } : {}),
      });
    },
    onSuccess: () => {
      setPrefill({ name: '', email: '', phone: '' });
      void qc.invalidateQueries({ queryKey: ['pendingInvites', coachId] });
    },
    onError: (e) => void alertDialog({ title: t('coach.addClient'), message: commercialErrorMessage(e, t) }),
  });
  const revoke = useMutation({
    mutationFn: (code: string) => revokeInvite(code),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pendingInvites', coachId] }),
    onError: (e) => void alertDialog({ title: t('invite.revoke'), message: errorMessage(e, t) }),
  });

  const copy = async (code: string) => {
    const link = inviteLink(code);
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      /* clipboard blocked — the link text is still visible to copy manually */
    }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = async (code: string) => {
    const link = inviteLink(code);
    try {
      await navigator.share({ title: t('invite.shareTitle'), text: t('invite.shareText', { coach: coachName }), url: link });
    } catch {
      /* user cancelled the share sheet — not an error */
    }
  };
  const whatsapp = (code: string) => {
    const link = inviteLink(code);
    const text = `${t('invite.shareText', { coach: coachName })} ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="space-y-4" data-testid="coach-invite-panel">
      <p className="text-sm text-earth-muted">{t('invite.panelHint')}</p>

      {atLimit ? (
        <ClientCapBlocked maxClients={maxClients} testId="coach-invite-blocked" />
      ) : (
        <div className="space-y-2">
          <TextInput label={t('field.name')} data-testid="coach-invite-name" placeholder={t('invite.optional')} value={prefill.name} onChange={(e) => setPrefill({ ...prefill, name: e.target.value })} />
          <TextInput label={t('field.email')} type="email" autoComplete="off" data-testid="coach-invite-email" placeholder={t('invite.optional')} value={prefill.email} onChange={(e) => setPrefill({ ...prefill, email: e.target.value })} />
          <TextInput label={t('field.phone')} type="tel" inputMode="tel" autoComplete="off" data-testid="coach-invite-phone" placeholder={t('invite.optional')} value={prefill.phone} onChange={(e) => setPrefill({ ...prefill, phone: e.target.value })} />
          <SubscriptionPlanPicker coachId={coachId} onChange={setSub} testId="coach-invite-sub" />
          <button type="button" data-testid="coach-invite-generate" className="btn-primary w-full disabled:opacity-40" disabled={gen.isPending || !gate.canWrite} title={gate.reason} onClick={() => gen.mutate()}>
            {gen.isPending ? t('auth.working') : t('invite.generate')}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="label">{t('invite.pending')}</p>
        {pendingScreen.status === 'loading' ? (
          <div className="sk h-12 rounded-xl" aria-busy="true" />
        ) : pendingScreen.status === 'offline' ? (
          <OfflineState onRetry={pendingScreen.retry} testId="coach-invite-offline" />
        ) : pendingScreen.status === 'error' ? (
          <ErrorState onRetry={pendingScreen.retry} testId="coach-invite-error" />
        ) : (pending.data ?? []).length === 0 ? (
          <p className="text-sm text-earth-subtle" data-testid="coach-invite-empty">{t('invite.none')}</p>
        ) : (
          <div className="card divide-y divide-line-soft">
            {(pending.data ?? []).map((inv: SignupInvite) => (
              <div key={inv.code} className="space-y-2 px-3 py-2.5" data-testid="coach-invite-row" data-code={inv.code}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm">{inv.code}</span>
                      <span className="chip border-warn/50 px-2 py-0.5 text-[12px] text-warn">{t('invite.statusPending')}</span>
                      {inv.expiresAt != null && (
                        <span className="text-[12px] text-earth-subtle">{t('invite.expiresOn', { date: formatDate(inv.expiresAt, i18n.language, 'medium') })}</span>
                      )}
                    </span>
                    <span className="block truncate text-[12px] text-earth-subtle">{inv.displayName || inviteLink(inv.code)}</span>
                  </span>
                  <button type="button" data-testid="coach-invite-revoke" disabled={revoke.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} className="btn-ghost btn-sm text-danger disabled:opacity-40" onClick={() => revoke.mutate(inv.code)}>
                    {t('invite.revoke')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-testid="coach-invite-copy" className="btn-ghost btn-sm" onClick={() => void copy(inv.code)}>
                    <Icon name="download" size={13} /> {copied === inv.code ? t('invite.copied') : t('invite.copy')}
                  </button>
                  {canShare && (
                    <button type="button" data-testid="coach-invite-share" className="btn-ghost btn-sm" onClick={() => void share(inv.code)}>
                      <Icon name="chat" size={13} /> {t('invite.share')}
                    </button>
                  )}
                  <button type="button" data-testid="coach-invite-whatsapp" className="btn-ghost btn-sm" onClick={() => whatsapp(inv.code)}>
                    <Icon name="chat" size={13} /> {t('invite.whatsapp')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
