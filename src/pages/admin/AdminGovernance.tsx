import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCan } from '@/services/auth/permissions';
import { ROLE_PERMISSIONS } from '@/services/auth/roles';
import { listFlags, saveFlag } from '@/services/platform/flagsApi';
import { fetchAuditPage } from '@/services/platform/auditApi';
import type { FeatureFlag, FeatureFlagScope, Role } from '@/types';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

const ROLES: Role[] = ['super_admin', 'admin', 'coach', 'client'];

export function AdminGovernance() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canFlags = useCan('flags.manage');
  const canAudit = useCan('audit.read');
  const [addingFlag, setAddingFlag] = useState(false);

  const flags = useQuery({ queryKey: ['featureFlags'], queryFn: listFlags });
  const toggle = useMutation({
    mutationFn: (flag: FeatureFlag) => saveFlag({ ...flag, enabled: !flag.enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['featureFlags'] }),
  });

  const audit = useInfiniteQuery({
    queryKey: ['audit', 'all'],
    queryFn: ({ pageParam }) => fetchAuditPage(25, pageParam as QueryDocumentSnapshot | null),
    initialPageParam: null as QueryDocumentSnapshot | null,
    getNextPageParam: (p) => p.cursor,
    enabled: canAudit,
  });
  const logs = audit.data?.pages.flatMap((p) => p.logs) ?? [];
  const sentinel = useInfiniteScroll(() => void audit.fetchNextPage(), !!audit.hasNextPage && !audit.isFetchingNextPage);

  return (
    <>
      <TopBar testId="admin-governance" title={t('admin.governance')} eyebrow={t('platform.superAdmin')} />

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
                </div>
              </div>
              <button
                type="button"
                disabled={!canFlags || toggle.isPending}
                onClick={() => toggle.mutate(f)}
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

      {/* Roles & permissions reference */}
      <h2 className="h2 mb-2 mt-6">{t('admin.rolePermissions')}</h2>
      <div className="space-y-2">
        {ROLES.map((r) => (
          <div key={r} className="card">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium">{t(`roles.${r}`)}</span>
              <span className="font-mono text-[10.5px] text-earth-subtle">
                {r === 'super_admin' ? '★ all' : `${ROLE_PERMISSIONS[r].length}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r === 'super_admin' ? (
                <span className="chip chip-on">{t('admin.fullAccess')}</span>
              ) : ROLE_PERMISSIONS[r].length ? (
                ROLE_PERMISSIONS[r].map((p) => (
                  <span key={p} className="chip text-[11px]">
                    {p}
                  </span>
                ))
              ) : (
                <span className="text-[12px] text-earth-subtle">{t('admin.selfOnly')}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Audit logs */}
      {canAudit && (
        <>
          <h2 className="h2 mb-2 mt-6">{t('admin.auditLogs')}</h2>
          <div className="card divide-y divide-line-soft">
            {logs.length ? (
              logs.map((log) => (
                <div key={log.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium">{t(log.action, { defaultValue: log.action.replace(/\./g, ' ') })}</span>
                    <span className="font-mono text-[10.5px] text-earth-subtle">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="truncate text-[12px] text-earth-subtle">
                    {t(`roles.${log.actorRole}`)} → {log.targetUserId}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-sm text-earth-muted">{t('admin.noLogs')}</p>
            )}
          </div>
          <div ref={sentinel} />
        </>
      )}

      <Sheet open={addingFlag} onClose={() => setAddingFlag(false)} title={t('admin.addFlag')}>
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
    onSuccess: onDone,
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
      <input className="input" placeholder={t('admin.flagId')} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
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
        <input className="input" placeholder={t('admin.targetId')} value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} />
      )}
      <label className="flex items-center justify-between py-1">
        <span className="label">{t('admin.enabled')}</span>
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-5 w-5 accent-brand" />
      </label>
      <button type="submit" disabled={!form.id.trim() || mut.isPending} className="btn-primary w-full disabled:opacity-40">
        {t('common.save')}
      </button>
    </form>
  );
}
