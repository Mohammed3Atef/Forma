import { useMemo, useRef, useState } from 'react';
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
 *
 * Category now filters SERVER-SIDE (`adminAudit.list` accepts `action` as an
 * exact key or a bare category prefix) — a filtered view searches the whole
 * log, not just whatever pages happen to already be infinite-scrolled in.
 * The chip list itself accumulates every category ever seen (it only grows,
 * never shrinks with the active filter) so choosing a category doesn't
 * remove the other options from view. `adminAudit.list` also supports exact
 * `actorId`/`targetUserId`/date-range filters server-side for a future
 * lookup-by-account entry point (e.g. a "view audit log" deep link from an
 * account's own detail page); there's no free-text actor/target search here
 * yet since admins don't have a raw user id to type — see the pass report.
 */
export function AdminAudit() {
  const { t } = useTranslation();
  const canAudit = useCan('audit.read');
  const [cat, setCat] = useState('all');

  const filters = { action: cat === 'all' ? undefined : cat };
  const audit = useInfiniteQuery({
    queryKey: ['audit', filters],
    queryFn: ({ pageParam }) => fetchAuditPage(25, pageParam as string | null, filters),
    initialPageParam: null as string | null,
    getNextPageParam: (p) => p.cursor,
    enabled: canAudit,
  });
  const logs = audit.data?.pages.flatMap((p) => p.logs) ?? [];
  // A separate, unfiltered-by-actor query targeting a broader recent window,
  // purely to seed the category chip list so it doesn't collapse to just the
  // active filter. Cheap (one page, no infinite scroll) and cache-shared with
  // nothing else, so it's a small additional read, not a duplicate of `audit`.
  const allCat = useInfiniteQuery({
    queryKey: ['audit', 'categoriesSeed'],
    queryFn: ({ pageParam }) => fetchAuditPage(100, pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: () => null, // one page is enough to populate the chip list
    enabled: canAudit,
  });
  const categoriesSeed = allCat.data?.pages.flatMap((p) => p.logs) ?? [];
  const categoriesRef = useRef<Set<string>>(new Set());
  for (const l of [...categoriesSeed, ...logs]) categoriesRef.current.add(categoryOf(l.action));
  const categories = useMemo(() => ['all', ...Array.from(categoriesRef.current)], [categoriesSeed.length, logs.length]);
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
      {audit.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : audit.isError ? (
        <EmptyState
          icon="info"
          title={t('admin.auditLoadFailed')}
          message={t('admin.auditLoadFailedMessage')}
          action={<button type="button" className="btn-tonal btn-sm" onClick={() => void audit.refetch()}>{t('common.retry')}</button>}
        />
      ) : (
        <div className="card divide-y divide-line-soft p-0">
          {logs.length ? (
            logs.map((log) => (
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
      )}
      <div ref={sentinel} />
    </div>
  );
}
