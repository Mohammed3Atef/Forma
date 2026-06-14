import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { useCoachContent } from '@/hooks/useCoachContent';

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
                notes.map((n) => (
                  <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                    {n.kind === 'announcement' && <span className="eyebrow mb-1 block text-brand">{t('clientCoach.announcement')}</span>}
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                    <span className="font-mono text-[10.5px] text-earth-subtle">{new Date(n.createdAt).toLocaleDateString()}</span>
                  </div>
                ))
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
