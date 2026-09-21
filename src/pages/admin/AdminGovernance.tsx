import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { useCan } from '@/services/auth/permissions';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '@/services/auth/roles';
import type { Permission } from '@/types';
import { listFlags, saveFlag } from '@/services/platform/flagsApi';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { shortDate } from '@/lib/utils';
import type { FeatureFlag, FeatureFlagScope, Role } from '@/types';

// Client-first column order, matching the design's role×capability matrix exactly.
const ROLES: Role[] = ['client', 'coach', 'admin', 'super_admin'];

export function AdminGovernance() {
  const { t } = useTranslation();
  return (
    <>
      <TopBar testId="admin-governance" title={t('admin.governance')} eyebrow={t('platform.superAdmin')} />
      <GovernanceSections />
    </>
  );
}

/**
 * Feature flags + role/permission reference + audit logs. Rendered both by the
 * standalone /admin/governance route (above) and the dashboard hub's System tab.
 */
export function GovernanceSections() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const canFlags = useCan('flags.manage');
  const [addingFlag, setAddingFlag] = useState(false);

  const flags = useQuery({ queryKey: ['featureFlags'], queryFn: listFlags });
  const toggle = useMutation({
    mutationFn: (flag: FeatureFlag) => saveFlag({ ...flag, enabled: !flag.enabled }),
    onSuccess: (_v, flag) => {
      void qc.invalidateQueries({ queryKey: ['featureFlags'] });
      showToast({ title: t(flag.enabled ? 'admin.flagDisabled' : 'admin.flagEnabled', { id: flag.id }), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('admin.featureFlags'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const doToggle = async (f: FeatureFlag) => {
    const ok = await confirmDialog({
      title: t('admin.featureFlags'),
      message: t(f.enabled ? 'admin.confirmDisableFlag' : 'admin.confirmEnableFlag', { id: f.id, scope: t(`platform.scopes.${f.scope}`) }),
      danger: f.enabled,
    });
    if (ok) toggle.mutate(f);
  };

  // Permission keys are dotted (e.g. "users.read"), which collides with
  // i18next's own `.` key-path separator — fetched as one raw object via
  // `returnObjects` and indexed in JS instead of via a dotted `t()` call.
  const permissionInfo = t('admin.permissionInfo', { returnObjects: true }) as Record<
    Permission,
    { label: string; desc: string; dangerous?: boolean } | undefined
  >;

  return (
    <>
      {/* Feature flags */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="h2">{t('admin.featureFlags')}</h2>
        {canFlags && (
          <button type="button" className="eyebrow text-brand" onClick={() => setAddingFlag(true)}>
            {t('common.add')}
          </button>
        )}
      </div>
      <div className="card divide-y divide-line-soft">
        {flags.data?.length ? (
          flags.data.map((f) => (
            <div key={f.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="truncate font-medium">{f.id}</div>
                <div className="text-[12px] text-earth-subtle">
                  {t(`platform.scopes.${f.scope}`)}
                  {f.targetId ? ` · ${f.targetId}` : ''}
                  {f.updatedAt ? ` · ${t('admin.flagUpdated', { date: shortDate(new Date(f.updatedAt).toISOString().slice(0, 10), i18n.language) })}` : ''}
                </div>
              </div>
              <button
                type="button"
                disabled={!canFlags || toggle.isPending}
                onClick={() => void doToggle(f)}
                className={`chip ${f.enabled ? 'chip-on' : ''} disabled:opacity-40`}
              >
                {t(f.enabled ? 'admin.on' : 'admin.off')}
              </button>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-earth-muted">{t('admin.noFlags')}</p>
        )}
      </div>

      {/* Roles & permissions reference — human label + plain-English description
          per capability, not a raw dotted permission key. Sensitive
          capabilities (role/status changes, writing any client's data) get a
          visual flag so they read as different in kind, not just another row. */}
      <h2 className="h2 mb-2 mt-6">{t('admin.rolePermissions')}</h2>
      <div className="tbl-wrap overflow-x-auto rounded-xl2 border border-line">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-card">
              <th className="px-4 py-2.5 text-start font-mono text-[10px] uppercase tracking-[0.07em] text-earth-subtle">{t('admin.capability')}</th>
              {ROLES.map((r) => (
                <th key={r} className="px-3 py-2.5 text-end font-mono text-[10px] uppercase tracking-[0.07em] text-earth-subtle">{t(`roles.${r}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((perm) => {
              const info = permissionInfo[perm];
              return (
                <tr key={perm} className={`border-b border-line-soft last:border-b-0 ${info?.dangerous ? 'bg-warn/5' : ''}`}>
                  <td className={`px-4 py-2.5 ${info?.dangerous ? 'border-s-2 border-warn' : ''}`}>
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-earth">{info?.label ?? perm}</span>
                      {info?.dangerous && (
                        <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
                          {t('admin.dangerousPermission')}
                        </span>
                      )}
                    </span>
                    {info?.desc && <span className="mt-0.5 block text-[12px] text-earth-subtle">{info.desc}</span>}
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-end align-top">
                      {ROLE_PERMISSIONS[r].includes(perm) ? (
                        <Icon name="check" size={15} className={info?.dangerous ? 'text-warn' : 'text-success'} />
                      ) : (
                        <span className="font-mono text-earth-subtle">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Sheet open={addingFlag} onClose={() => setAddingFlag(false)} size="md" title={t('admin.addFlag')}>
        <FlagForm
          onDone={() => {
            setAddingFlag(false);
            void qc.invalidateQueries({ queryKey: ['featureFlags'] });
          }}
        />
      </Sheet>
    </>
  );
}

function FlagForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<{ id: string; scope: FeatureFlagScope; enabled: boolean; targetId: string }>({
    id: '',
    scope: 'global',
    enabled: true,
    targetId: '',
  });
  const mut = useMutation({
    mutationFn: () =>
      saveFlag({
        id: form.id.trim(),
        scope: form.scope,
        enabled: form.enabled,
        ...(form.scope !== 'global' && form.targetId.trim() ? { targetId: form.targetId.trim() } : {}),
        updatedAt: Date.now(),
      }),
    onSuccess: () => { showToast({ title: t('common.saved'), variant: 'success' }); onDone(); },
    onError: (e) => void alertDialog({ title: t('admin.addFlag'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const scopes: FeatureFlagScope[] = ['global', 'coach', 'client'];
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.id.trim()) mut.mutate();
      }}
    >
      <TextInput label={t('field.id')} placeholder={t('admin.flagId')} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
      <div>
        <div className="label mb-2">{t('admin.scope')}</div>
        <div className="flex gap-2">
          {scopes.map((s) => (
            <button key={s} type="button" onClick={() => setForm({ ...form, scope: s })} className={`chip ${form.scope === s ? 'chip-on' : ''}`}>
              {t(`platform.scopes.${s}`)}
            </button>
          ))}
        </div>
      </div>
      {form.scope !== 'global' && (
        <TextInput label={t('field.targetId')} placeholder={t('admin.targetId')} value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} />
      )}
      <label className="flex items-center justify-between py-1">
        <span className="label">{t('admin.enabled')}</span>
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-5 w-5 accent-brand" />
      </label>
      <SubmitButton type="submit" pending={mut.isPending} disabled={!form.id.trim()} fullWidth>
        {t('common.save')}
      </SubmitButton>
    </form>
  );
}
