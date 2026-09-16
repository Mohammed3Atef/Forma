import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useCan } from '@/services/auth/permissions';
import { fetchAuditPage } from '@/services/platform/auditApi';

/** The real category a logged action belongs to — derived from its dot-prefix (e.g. `coachPlan.setTier` -> `coachPlan`), not a fixed taxonomy the data doesn't have. */
function categoryOf(action: string): string {
  return action.split('.')[0] || action;
}

/**
 * Audit log as its own destination — matches the design's "Govern → Audit"
 * screen. Extracted from `AdminGovernance.tsx` (still real, same
 * `fetchAuditPage`/infinite-scroll data this always used). Category filter
 * chips are derived from the actual distinct action-prefixes present in the
 * data rather than the design's fictional Accounts/Permissions/Billing/
 * Content taxonomy, which the real `action: string` field has no room for.
 */
export function AdminAudit() {
  const { t } = useTranslation();
  const canAudit = useCan('audit.read');
  const [cat, setCat] = useState('all');

  const audit = useInfiniteQuery({
    queryKey: ['audit', 'all'],
    queryFn: ({ pageParam }) => fetchAuditPage(25, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (p) => p.cursor,
    enabled: canAudit,
  });
  const logs = audit.data?.pages.flatMap((p) => p.logs) ?? [];
  const categories = useMemo(() => ['all', ...Array.from(new Set(logs.map((l) => categoryOf(l.action))))], [logs]);
  const filtered = cat === 'all' ? logs : logs.filter((l) => categoryOf(l.action) === cat);
  const sentinel = useInfiniteScroll(() => void audit.fetchNextPage(), !!audit.hasNextPage && !audit.isFetchingNextPage);

  if (!canAudit) {
    return (
      <>
        <TopBar title={t('admin.auditLogs')} eyebrow={t('nav.groupGovern')} />
        <p className="py-8 text-center text-sm text-earth-muted">{t('admin.cannotEditSuper')}</p>
      </>
    );
  }

  return (
    <div data-testid="admin-audit">
      <TopBar title={t('admin.auditLogs')} eyebrow={t('nav.groupGovern')} />
      {categories.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={`chip shrink-0 ${cat === c ? 'chip-on' : ''}`}>
              {c === 'all' ? t('common.all') : c}
            </button>
          ))}
        </div>
      )}
      <div className="card divide-y divide-line-soft p-0">
        {filtered.length ? (
          filtered.map((log) => (
            <div key={log.id} className="rowline">
              <span className="tk-ic"><Icon name="list" size={15} /></span>
              <div className="grow min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t(log.action, { defaultValue: log.action.replace(/\./g, ' ') })}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-earth-subtle">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <p className="truncate text-[12px] text-earth-subtle">{t(`roles.${log.actorRole}`)} → {log.targetUserId}</p>
              </div>
            </div>
          ))
        ) : (
          <EmptyState icon="list" title={t('admin.noLogs')} />
        )}
      </div>
      <div ref={sentinel} />
    </div>
  );
}
