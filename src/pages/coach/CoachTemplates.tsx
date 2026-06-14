import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useSession } from '@/services/auth/sessionStore';
import {
  assignTemplate,
  createTemplate,
  deleteTemplate,
  listMyClients,
  listTemplates,
} from '@/services/platform/coachApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { PlanKind, PlanTemplate } from '@/types';

export function CoachTemplates() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<PlanTemplate | null>(null);

  const templates = useQuery({ queryKey: ['templates', coachId], queryFn: () => listTemplates(coachId!), enabled: !!coachId });
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), enabled: !!coachId });

  const del = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['templates', coachId] }),
  });

  const remove = async (tpl: PlanTemplate) => {
    const ok = await confirmDialog({ title: t('common.delete'), message: t('coach.confirmDeleteTemplate'), danger: true });
    if (ok) del.mutate(tpl.id);
  };

  return (
    <>
      <TopBar
        title={t('coach.templates')}
        eyebrow={t('platform.coachPortal')}
        right={
          <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('coach.newTemplate')} onClick={() => setCreating(true)}>
            <Icon name="plus" size={20} />
          </button>
        }
      />

      {templates.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : templates.data?.length ? (
        <div className="space-y-2">
          {templates.data.map((tpl) => (
            <div key={tpl.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{tpl.title}</div>
                  <div className="font-mono text-[10.5px] uppercase text-earth-subtle">{t(`coach.kind.${tpl.kind}`)}</div>
                </div>
                <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void remove(tpl)}>
                  <Icon name="close" size={18} />
                </button>
              </div>
              {tpl.description && <p className="mt-1 whitespace-pre-wrap text-[13px] text-earth-muted">{tpl.description}</p>}
              <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setAssigning(tpl)}>
                {t('coach.assignToClient')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('coach.noTemplates')}</div>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title={t('coach.newTemplate')}>
        <TemplateForm
          coachId={coachId ?? ''}
          onSaved={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['templates', coachId] });
          }}
        />
      </Sheet>

      <Sheet open={!!assigning} onClose={() => setAssigning(null)} title={t('coach.assignToClient')}>
        {assigning && (
          <AssignTemplate
            template={assigning}
            clients={clients.data ?? []}
            assignedBy={coachId ?? ''}
            onDone={() => setAssigning(null)}
          />
        )}
      </Sheet>
    </>
  );
}

function TemplateForm({ coachId, onSaved }: { coachId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<{ kind: PlanKind; title: string; description: string }>({ kind: 'workout', title: '', description: '' });
  const mut = useMutation({
    mutationFn: () => createTemplate(coachId, { kind: form.kind, title: form.title.trim(), description: form.description.trim() }),
    onSuccess: onSaved,
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['workout', 'nutrition'] as PlanKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} className={`chip ${form.kind === k ? 'chip-on' : ''}`}>
            {t(`coach.kind.${k}`)}
          </button>
        ))}
      </div>
      <input className="input" placeholder={t('coach.planTitle')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className="input min-h-28" placeholder={t('coach.planDescription')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <button type="button" disabled={!form.title.trim() || mut.isPending} onClick={() => mut.mutate()} className="btn-primary w-full disabled:opacity-40">
        {t('common.save')}
      </button>
    </div>
  );
}

function AssignTemplate({
  template,
  clients,
  assignedBy,
  onDone,
}: {
  template: PlanTemplate;
  clients: { id: string; displayName: string; email: string }[];
  assignedBy: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const mut = useMutation({
    mutationFn: (clientId: string) => assignTemplate(template, clientId, assignedBy),
    onSuccess: onDone,
  });
  if (!clients.length) return <p className="py-4 text-sm text-earth-muted">{t('coach.noClients')}</p>;
  return (
    <div className="card divide-y divide-line-soft">
      {clients.map((c) => (
        <button key={c.id} type="button" disabled={mut.isPending} onClick={() => mut.mutate(c.id)} className="row w-full text-start">
          <span className="row-av font-serif">{(c.displayName || c.email || '?').charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate">{c.displayName || c.email}</span>
        </button>
      ))}
    </div>
  );
}
