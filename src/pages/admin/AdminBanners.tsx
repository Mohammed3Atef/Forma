import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { TextInput, TextAreaField, SelectField } from '@/components/ui/Field';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useSession } from '@/services/auth/sessionStore';
import { confirmDialog } from '@/stores/dialogStore';
import { uid } from '@/lib/utils';
import {
  listBanners, saveBanner, deleteBanner,
  type Banner, type BannerStyle, type BannerPlacement, type BannerSegment,
} from '@/services/platform/bannersApi';
import { Pill } from '@/components/ui/Pill';
import type { Role } from '@/types';

const STYLE_CLASS: Record<BannerStyle, string> = {
  info: 'border-brand/40 bg-brand/5', success: 'border-success/40 bg-success/5',
  warning: 'border-warn/40 bg-warn/5', promo: 'border-brand/50 bg-brand/10',
};
const toDate = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : null);

function blank(createdBy: string): Banner {
  const now = Date.now();
  return { id: uid('bnr'), title: '', body: '', ctaLabel: '', ctaHref: '', style: 'promo', placement: 'all', roles: [], segment: 'all', active: true, startAt: null, endAt: null, createdBy, createdAt: now, updatedAt: now };
}

/** Admin: create, design, schedule & target offer/announcement banners. */
export function AdminBanners() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actorId = useSession((s) => s.account?.id ?? 'self');
  useFullBleed();
  const [editing, setEditing] = useState<Banner | null>(null);

  const q = useQuery({ queryKey: ['banners', 'admin'], queryFn: listBanners, staleTime: 60_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['banners'] });
  const save = useMutation({ mutationFn: (b: Banner) => saveBanner({ ...b, updatedAt: Date.now() }), onSuccess: () => { setEditing(null); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => deleteBanner(id), onSuccess: () => { setEditing(null); refresh(); } });
  const toggle = useMutation({ mutationFn: (b: Banner) => saveBanner({ ...b, active: !b.active, updatedAt: Date.now() }), onSuccess: refresh });

  const remove = async (b: Banner) => { if (await confirmDialog({ title: t('common.delete'), message: b.title || t('adminBanners.untitled'), danger: true })) del.mutate(b.id); };
  const list = q.data ?? [];

  return (
    <div data-testid="admin-banners">
      <PageHeader
        eyebrow={t('platform.superAdmin')}
        title={t('adminBanners.title')}
        actions={<button type="button" data-testid="banner-new" className="btn-primary h-[42px] gap-2 px-4" onClick={() => setEditing(blank(actorId))}><Icon name="plus" size={18} /> {t('adminBanners.new')}</button>}
      />
      {q.isLoading ? (
        <LoadingState variant="list" count={3} />
      ) : list.length === 0 ? (
        <EmptyState icon="info" title={t('adminBanners.empty')} message={t('adminBanners.emptyHint')} />
      ) : (
        <div className="space-y-3">
          {list.map((b) => (
            <div key={b.id} className={`rounded-xl border p-4 ${STYLE_CLASS[b.style]}`} data-testid="banner-row">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.title || t('adminBanners.untitled')}</p>
                  {b.body ? <p className="mt-0.5 truncate text-sm text-earth-muted">{b.body}</p> : null}
                  <p className="mt-1.5 text-[12px] text-earth-subtle">
                    {t(`adminBanners.placement.${b.placement}`)} · {b.roles.length ? b.roles.map((r) => t(`roles.${r}`)).join(', ') : t('adminBanners.allRoles')} · {t(`adminBanners.segment.${b.segment}`)}
                    {b.endAt ? ` · ${t('adminBanners.until', { date: toDate(b.endAt) })}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill tone={b.active ? 'ok' : 'mute'}>{b.active ? t('adminBanners.on') : t('adminBanners.off')}</Pill>
                  <button type="button" className="btn-ghost h-8 px-3 text-[11px]" onClick={() => toggle.mutate(b)}>{b.active ? t('adminBanners.disable') : t('adminBanners.enable')}</button>
                  <button type="button" className="btn-ghost h-8 px-3 text-[11px]" onClick={() => setEditing(b)}>{t('common.edit')}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} size="lg" title={t('adminBanners.title')}>
        {editing ? <BannerForm value={editing} onChange={setEditing} onSave={() => save.mutate(editing)} onDelete={() => void remove(editing)} busy={save.isPending || del.isPending} /> : null}
      </Sheet>
    </div>
  );
}

function BannerForm({ value, onChange, onSave, onDelete, busy }: { value: Banner; onChange: (b: Banner) => void; onSave: () => void; onDelete: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const set = (patch: Partial<Banner>) => onChange({ ...value, ...patch });
  const toggleRole = (r: Role) => set({ roles: value.roles.includes(r) ? value.roles.filter((x) => x !== r) : [...value.roles, r] });
  const styles: BannerStyle[] = ['promo', 'info', 'success', 'warning'];
  const placements: BannerPlacement[] = ['all', 'client_home', 'coach_dashboard'];
  const segments: BannerSegment[] = ['all', 'new', 'existing'];
  const roleOpts: Role[] = ['client', 'coach'];

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (value.title.trim()) onSave(); }}>
      {/* Live preview */}
      <div>
        <p className="label mb-1">{t('adminBanners.preview')}</p>
        <div className={`rounded-xl border px-4 py-3 ${STYLE_CLASS[value.style]}`}>
          <p className="font-semibold">{value.title || t('adminBanners.untitled')}</p>
          {value.body ? <p className="mt-0.5 text-sm text-earth-muted">{value.body}</p> : null}
          {value.ctaLabel ? <span className="mt-2 inline-block text-sm font-semibold text-brand">{value.ctaLabel}</span> : null}
        </div>
      </div>

      <TextInput label={t('adminBanners.headline')} required value={value.title} onChange={(e) => set({ title: e.target.value })} data-testid="banner-title" />
      <TextAreaField label={t('adminBanners.body')} value={value.body ?? ''} onChange={(e) => set({ body: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label={t('adminBanners.ctaLabel')} value={value.ctaLabel ?? ''} onChange={(e) => set({ ctaLabel: e.target.value })} />
        <TextInput label={t('adminBanners.ctaHref')} type="url" dir="ltr" value={value.ctaHref ?? ''} onChange={(e) => set({ ctaHref: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label={t('adminBanners.style')} value={value.style} onChange={(e) => set({ style: e.target.value as BannerStyle })}>
          {styles.map((s) => <option key={s} value={s}>{t(`adminBanners.styleOpt.${s}`)}</option>)}
        </SelectField>
        <SelectField label={t('adminBanners.placementLabel')} value={value.placement} onChange={(e) => set({ placement: e.target.value as BannerPlacement })}>
          {placements.map((p) => <option key={p} value={p}>{t(`adminBanners.placement.${p}`)}</option>)}
        </SelectField>
      </div>
      <div>
        <p className="label mb-2">{t('adminBanners.audience')}</p>
        <div className="flex flex-wrap gap-2">
          {roleOpts.map((r) => (
            <button type="button" key={r} onClick={() => toggleRole(r)} className={`chip ${value.roles.includes(r) ? 'chip-on' : ''}`}>{t(`roles.${r}`)}</button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-earth-subtle">{t('adminBanners.audienceHint')}</p>
      </div>
      <SelectField label={t('adminBanners.segmentLabel')} value={value.segment} onChange={(e) => set({ segment: e.target.value as BannerSegment })}>
        {segments.map((s) => <option key={s} value={s}>{t(`adminBanners.segment.${s}`)}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="label mb-1">{t('adminBanners.startAt')}</p><input type="date" className="input" value={toDate(value.startAt)} onChange={(e) => set({ startAt: toMs(e.target.value) })} /></div>
        <div><p className="label mb-1">{t('adminBanners.endAt')}</p><input type="date" className="input" value={toDate(value.endAt)} onChange={(e) => set({ endAt: toMs(e.target.value) })} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.active} onChange={(e) => set({ active: e.target.checked })} /> {t('adminBanners.activeNow')}</label>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={busy || !value.title.trim()} className="btn-primary flex-1 disabled:opacity-40" data-testid="banner-save">{t('common.save')}</button>
        <button type="button" disabled={busy} className="btn-ghost px-4 text-danger" onClick={onDelete}>{t('common.delete')}</button>
      </div>
    </form>
  );
}
