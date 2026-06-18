import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { ClientSubscriptionSection } from '@/components/ClientSubscriptionSection';
import { useCoachContent } from '@/hooks/useCoachContent';
import { clientNoteRoute } from '@/lib/noteTarget';

export function CoachInbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enabled, notes, plans, targets } = useCoachContent();

  return (
    <>
      <TopBar title={t('clientCoach.title')} eyebrow={t('app.name')} onBack={() => navigate('/')} />

      {!enabled ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('clientCoach.signedOut')}</div>
      ) : (
        <div className="space-y-6">
          {/* Message your coach */}
          <button type="button" data-testid="open-messages" onClick={() => navigate('/messages')} className="card-tap flex w-full items-center gap-3 text-start">
            <span className="row-av bg-brand/15 text-brand"><Icon name="info" size={18} /></span>
            <span className="min-w-0 flex-1 font-medium">{t('messages.title')}</span>
            <Icon name="chevron" size={18} className="text-earth-subtle" />
          </button>

          {/* Subscription + freeze request */}
          <ClientSubscriptionSection />

          {/* Coach targets */}
          {targets && (
            <section>
              <h2 className="h2 mb-2">{t('coach.targets')}</h2>
              <div className="card grid grid-cols-3 gap-3 text-center">
                <Cell label={t('coach.water')} value={targets.waterMl} unit="ml" />
                <Cell label={t('coach.steps')} value={targets.steps} />
                <Cell label={t('coach.cardio')} value={targets.cardioMin} unit={t('common.min')} />
                <Cell label={t('nutrition.calories')} value={targets.calories} />
                <Cell label={t('nutrition.protein')} value={targets.protein} unit="g" />
              </div>
            </section>
          )}

          {/* Assigned plans */}
          {plans.length > 0 && (
            <section>
              <h2 className="h2 mb-2">{t('coach.plans')}</h2>
              <div className="space-y-2">
                {plans.map((p) => (
                  <div key={p.id} className="card">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.title}</span>
                      <span className="font-mono text-[10.5px] uppercase text-earth-subtle">{t(`coach.kind.${p.kind}`)}</span>
                    </div>
                    {p.description && <p className="mt-1 whitespace-pre-wrap text-[13px] text-earth-muted">{p.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notes & announcements */}
          <section>
            <h2 className="h2 mb-2">{t('clientCoach.notes')}</h2>
            <div className="card divide-y divide-line-soft">
              {notes.length ? (
                notes.map((n) => {
                  const anchored = !!(n.entityType && n.entityId);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      disabled={!anchored}
                      onClick={() => anchored && navigate(clientNoteRoute(n))}
                      className="flex w-full items-start gap-2 py-3 text-start first:pt-0 last:pb-0 disabled:cursor-default"
                    >
                      <span className="min-w-0 flex-1">
                        {n.kind === 'announcement' && <span className="eyebrow mb-1 block text-brand">{t('clientCoach.announcement')}</span>}
                        <span className="block whitespace-pre-wrap text-sm">{n.body}</span>
                        <span className="font-mono text-[10.5px] text-earth-subtle">{new Date(n.createdAt).toLocaleDateString()}</span>
                      </span>
                      {anchored && <Icon name="chevron" size={16} className="mt-0.5 shrink-0 text-earth-subtle" />}
                    </button>
                  );
                })
              ) : (
                <p className="py-2 text-sm text-earth-muted">{t('clientCoach.noNotes')}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Cell({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  if (value == null) return <div />;
  return (
    <div>
      <div className="stat-num text-2xl">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
