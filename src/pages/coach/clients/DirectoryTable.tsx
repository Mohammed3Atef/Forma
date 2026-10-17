import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { ActionMenu } from '@/components/ui/ActionMenu';
import type { DirectoryRow, DirectorySort } from '@/lib/coachDirectory';
import { AccountPill, StatePill, useActivityText } from './parts';

const ws = (id: string) => `/coach/client/${encodeURIComponent(id)}`;

/**
 * The desktop directory (≥ 1024 px, TB-01 / TB-08): five columns — Client ·
 * Next action · Last workout · Workouts (7d) · Package — sortable from the
 * header (`aria-sort`), a row action menu, and column priority instead of a
 * horizontal scroll (Workouts folds under Last workout below 1280 px). The
 * name is the row's link; a click anywhere else on the row opens the client
 * too (rows are not `role=button`).
 */
export function DirectoryTable({
  rows,
  sort,
  dir,
  onSort,
  reasonOf,
}: {
  rows: DirectoryRow[];
  sort: DirectorySort;
  dir: 'asc' | 'desc';
  onSort: (s: DirectorySort) => void;
  reasonOf: (r: DirectoryRow) => { text: string; needs: boolean };
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activityOf = useActivityText(true);
  const head = (key: DirectorySort, label: string, className = '') => {
    const active = sort === key;
    return (
      <th scope="col" className={`px-3 py-2.5 text-start font-medium ${className}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`inline-flex items-center gap-1 hover:text-earth ${active ? 'text-earth' : ''}`} data-testid={`clients-sort-${key}`} onClick={() => onSort(key)}>
          {label}
          {active ? <Icon name="chevronDown" size={13} className={dir === 'desc' ? '' : 'rotate-180'} /> : null}
        </button>
      </th>
    );
  };
  const openRow = (e: MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    navigate(ws(id));
  };

  return (
    <div className="overflow-hidden rounded-ui-surface border border-white/[0.07] bg-surface-card">
      <table className="w-full table-fixed border-collapse text-[14px]" data-testid="coach-desktop-clients">
        <thead className="border-b border-white/[0.07] text-[12px] uppercase tracking-wide text-earth-subtle">
          <tr>
            {head('name', t('coachClients.col.client'), 'w-[24%]')}
            {head('needs', t('coachClients.col.next'), 'w-[32%] xl:w-[31%]')}
            {head('lastWorkout', t('coachClients.col.lastWorkout'), 'w-[17%] xl:w-[13%]')}
            {head('workouts', t('coachClients.col.workouts'), 'hidden w-[11%] xl:table-cell')}
            {head('daysLeft', t('coachClients.col.package'), 'w-[19%] xl:w-[15%]')}
            <th scope="col" className="w-[8%] px-3 py-2.5 xl:w-[6%]">
              <span className="sr-only">{t('coachClients.col.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((r) => {
            const reason = reasonOf(r);
            return (
              <tr key={r.id} data-testid="client-table-row" data-client-id={r.id} className="cursor-pointer align-middle transition-colors hover:bg-white/[0.03]" onClick={(e) => openRow(e, r.id)}>
                <td className="px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" />
                    <span className="min-w-0">
                      <Link to={ws(r.id)} data-testid="client-open" title={r.name} className="block truncate font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <AccountPill row={r} />
                    </span>
                  </span>
                </td>
                <td className={`px-3 py-2.5 ${reason.needs ? 'text-earth' : 'text-earth-subtle'}`}>
                  <span className="line-clamp-2 leading-snug">{reason.needs ? reason.text : '—'}</span>
                </td>
                <td className="px-3 py-2.5 text-earth-muted">
                  <span className="block truncate">{activityOf(r)}</span>
                  <span className="block truncate text-[12px] text-earth-subtle xl:hidden">{r.workouts7d != null ? t('coachDash.workoutsThisWeek', { n: r.workouts7d }) : ''}</span>
                </td>
                <td className="hidden px-3 py-2.5 font-mono tabular-nums text-earth-muted xl:table-cell">{r.workouts7d ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-col items-start gap-1 whitespace-nowrap">
                    <StatePill row={r} />
                    {r.daysLeft != null && r.state !== 'expiring' ? <span className="text-[12px] text-earth-subtle">{t('coachClients.daysLeft', { count: r.daysLeft })}</span> : null}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-end">
                  <ActionMenu
                    label={t('coachClients.menu.label', { name: r.name })}
                    size="sm"
                    testId="client-row-menu"
                    items={[
                      { key: 'open', label: t('coachClients.menu.open'), icon: 'user', onSelect: () => navigate(ws(r.id)) },
                      { key: 'message', label: t('coachClients.menu.message'), icon: 'chat', onSelect: () => navigate(`/coach/messages/${encodeURIComponent(r.id)}`) },
                      { key: 'subscription', label: t('coachClients.menu.subscription'), icon: 'calendar', onSelect: () => navigate(`${ws(r.id)}/subscription`) },
                      { key: 'checkins', label: t('coachClients.menu.checkins'), icon: 'check', onSelect: () => navigate(`${ws(r.id)}/checkins`) },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
