import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CoachClientRelationship, Subscription, WeeklyCheckIn } from '@/types';
import type { SourceState, TodaySources } from '@/lib/coachToday';
import { today as todayKey, weekRange } from '@/lib/utils';

/**
 * B3.3 Clients directory: honest states, rows without contact details, URL
 * filters / sort, the weekly check-ins view (bulk request only for eligible
 * clients) and scale (load more / table pages).
 */
const h = vi.hoisted(() => ({
  data: null as unknown as { sources: TodaySources; updatedAt: number; refreshing: boolean; refresh: () => void },
  desktop: false,
  online: true,
  request: vi.fn(async () => undefined),
}));
vi.mock('@/hooks/useCoachSources', () => ({ useCoachSources: () => h.data }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsDesktop: () => h.desktop, useIsTabletUp: () => h.desktop, useMediaQuery: () => h.desktop }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
vi.mock('@/components/coach/CoachPlanProvider', () => ({ useCoachPlan: () => ({ canWrite: true, state: 'active', daysLeft: 20, plan: null }) }));
vi.mock('@/services/platform/coachPlanApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/coachPlanApi')>()), coachPlanQuery: () => ({ queryKey: ['coachPlan', 'c'], queryFn: async () => ({ maxClients: 25, activeClientCount: 0, state: 'active' }) }) }));
vi.mock('@/services/platform/transferApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/transferApi')>()), listIncomingTransferRequests: async () => [], listOutgoingTransferRequests: async () => [] }));
vi.mock('@/services/platform/checkInApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/checkInApi')>()), requestCheckIn: h.request }));
vi.mock('@/components/coach/ClientContextPanel', () => ({ ClientContextPanel: () => null }));

import { useSession } from '@/services/auth/sessionStore';
import { DialogHost } from '@/components/DialogHost';
import { CoachClients } from './CoachClients';

const COACH = 'coach-1';
const DAY = 86_400_000;
const now = Date.now();
const WEEK = weekRange(todayKey()).weekStart;
const ok = <T,>(data: T): SourceState<T> => ({ data, error: false });
const sub = (over: Partial<Subscription> = {}): Subscription => ({ status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, updatedAt: now, ...over });
const rel = (clientId: string, over: Partial<CoachClientRelationship> = {}): CoachClientRelationship => ({
  id: `${COACH}__${clientId}`, coachId: COACH, clientId, status: 'active', createdBy: COACH, createdAt: now - 30 * DAY, updatedAt: now, subscription: sub(), ...over,
});
const ci = (clientId: string, over: Partial<WeeklyCheckIn> = {}): WeeklyCheckIn => ({ id: WEEK, clientId, coachId: COACH, weekStart: WEEK, weekEnd: '2999-01-01', status: 'requested', progressPhotos: {}, createdAt: now, updatedAt: now, ...over });

function sources(ids: string[], over: Partial<TodaySources> = {}): TodaySources {
  return {
    roster: ok(ids.map((id) => ({ id, displayName: `Client ${id.toUpperCase()}`, email: `${id}@mail.test`, phone: `+20100${id}`, accountStatus: 'active' }))),
    relationships: ok(ids.map((id) => rel(id))),
    summaries: ok(ids.map((id) => ({ clientId: id, lastActivity: todayKey(), workouts7d: 2, assessment: 'reviewed' as const, hasWorkoutPlan: true, hasNutritionPlan: true }))),
    checkIns: ok(ids.map((id) => ({ clientId: id, latest: null, previous: null }))),
    threads: ok(ids.map((id) => ({ clientId: id, unreadForCoach: 0, last: null }))),
    transfers: ok([]),
    freezeRequests: ok([]),
    ...over,
  };
}
const refresh = vi.fn();
const setData = (s: TodaySources) => {
  h.data = { sources: s, updatedAt: now, refreshing: false, refresh };
};
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function renderAt(path = '/coach/clients') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coach/clients" element={<><CoachClients /><Where /><DialogHost /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.desktop = false;
  h.online = true;
  refresh.mockReset();
  h.request.mockClear();
  useSession.setState({ uid: COACH, account: { id: COACH, role: 'coach', accountStatus: 'active', displayName: 'Amira', email: 'amira@x.test' } as never });
});

describe('Clients — states', () => {
  it('loading, error (Retry) and offline are distinct; none of them claims "no clients"', () => {
    setData(sources([], { roster: { data: undefined, error: false } }));
    const a = renderAt();
    expect(screen.getByTestId('clients-loading')).toBeInTheDocument();
    a.unmount();
    setData(sources([], { roster: { data: undefined, error: true } }));
    const b = renderAt();
    fireEvent.click(within(screen.getByTestId('coach-clients-error')).getByRole('button'));
    expect(refresh).toHaveBeenCalled();
    b.unmount();
    h.online = false;
    renderAt();
    expect(screen.getByTestId('coach-clients-offline')).toBeInTheDocument();
    expect(screen.queryByTestId('clients-empty')).toBeNull();
  });

  it('no clients: an empty state with Add client', () => {
    setData(sources([]));
    renderAt();
    expect(screen.getByTestId('clients-empty')).toBeInTheDocument();
  });

  it('a source failing marks unknown details "—" and says so (Retry), never zero / "no plan"', () => {
    setData(sources(['a'], { summaries: { data: undefined, error: true } }));
    renderAt();
    expect(screen.getByTestId('clients-partial')).toBeInTheDocument();
    expect(screen.getByTestId('coach-client-row')).toHaveTextContent('—');
  });
});

describe('Clients — the list', () => {
  it('rows: name, reason (Today\'s wording) and state; never the email or phone; each opens the client', () => {
    setData(sources(['a', 'b'], { threads: ok([{ clientId: 'a', unreadForCoach: 2, last: { body: 'Hi coach', fromRole: 'client', createdAt: now } }]) }));
    renderAt();
    const rows = screen.getAllByTestId('coach-client-row');
    expect(rows[0]).toHaveTextContent('Client A');
    expect(rows[0]).toHaveTextContent('2 unread messages');
    expect(rows[1]).toHaveTextContent('Worked out today');
    for (const r of rows) {
      expect(r).not.toHaveTextContent('@mail.test');
      expect(r).not.toHaveTextContent('+20100');
    }
    expect(rows[0]).toHaveAttribute('href', '/coach/client/a');
    expect(within(rows[0]).getByTestId('client-coaching-state')).toHaveTextContent('Active');
  });

  it('search matches email / phone though they are not shown; chips filter and live in the URL', () => {
    setData(sources(['a', 'b', 'c'], { relationships: ok([rel('a'), rel('b', { subscription: sub({ endAt: now + 2 * DAY }) }), rel('c', { subscription: sub({ endAt: now - 2 * DAY }) })]) }));
    renderAt();
    fireEvent.change(screen.getByTestId('coach-clients-search'), { target: { value: 'b@mail' } });
    expect(screen.getAllByTestId('coach-client-row').map((r) => r.dataset.clientId)).toEqual(['b']);
    expect(screen.getByTestId('where')).toHaveTextContent('q=b%40mail');
    fireEvent.change(screen.getByTestId('coach-clients-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('clients-task-renewal'));
    expect(screen.getAllByTestId('coach-client-row').map((r) => r.dataset.clientId)).toEqual(['b']);
    expect(screen.getByTestId('where')).toHaveTextContent('task=renewal');
    fireEvent.click(screen.getByTestId('clients-task-lapsed'));
    expect(screen.getAllByTestId('coach-client-row').map((r) => r.dataset.clientId)).toEqual(['c']);
    expect(screen.getByTestId('clients-task-needs')).toHaveTextContent('2');
  });

  it('filter sheet: package state and plan filters write the URL; a deep link restores them', () => {
    setData(sources(['a', 'b'], { relationships: ok([rel('a'), rel('b', { subscription: undefined })]), summaries: ok([{ clientId: 'a', lastActivity: null, workouts7d: 0, assessment: 'reviewed', hasWorkoutPlan: false, hasNutritionPlan: true }, { clientId: 'b', lastActivity: null, workouts7d: 0, assessment: 'reviewed', hasWorkoutPlan: true, hasNutritionPlan: true }]) }));
    const v = renderAt();
    fireEvent.click(screen.getByTestId('clients-filters-button'));
    fireEvent.click(screen.getByTestId('filter-state-none'));
    expect(screen.getByTestId('where')).toHaveTextContent('state=none');
    expect(screen.getAllByTestId('coach-client-row').map((r) => r.dataset.clientId)).toEqual(['b']);
    v.unmount();
    renderAt('/coach/clients?plan=noWorkout');
    expect(screen.getAllByTestId('coach-client-row').map((r) => r.dataset.clientId)).toEqual(['a']);
  });

  it('many clients: 20 rows, then "Show more"', () => {
    const ids = Array.from({ length: 45 }, (_, i) => `x${String(i).padStart(2, '0')}`);
    setData(sources(ids));
    renderAt();
    expect(screen.getAllByTestId('coach-client-row')).toHaveLength(20);
    fireEvent.click(screen.getByTestId('clients-load-more'));
    expect(screen.getAllByTestId('coach-client-row')).toHaveLength(40);
  });
});

describe('Clients — desktop table', () => {
  it('sortable columns (aria-sort), rows open the client, 50 per page', () => {
    h.desktop = true;
    const ids = Array.from({ length: 60 }, (_, i) => `x${String(i).padStart(2, '0')}`);
    setData(sources(ids));
    renderAt();
    const table = screen.getByTestId('coach-desktop-clients');
    expect(within(table).getAllByTestId('client-table-row')).toHaveLength(50);
    fireEvent.click(screen.getByTestId('clients-sort-name'));
    expect(screen.getByTestId('where')).toHaveTextContent('sort=name');
    expect(screen.getByTestId('clients-sort-name').closest('th')).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByTestId('clients-sort-name'));
    expect(screen.getByTestId('clients-sort-name').closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(within(table).getAllByTestId('client-open')[0]).toHaveTextContent('Client X59');
    fireEvent.click(within(table).getAllByTestId('client-table-row')[0].querySelector('td:nth-child(3)')!);
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/client/x59');
  });
});

describe('Clients — weekly check-ins (the old /coach/checkins)', () => {
  it('groups by this coach\'s check-in state; the bulk request asks first and goes only to eligible clients', async () => {
    setData(
      sources(['a', 'b', 'c', 'd'], {
        relationships: ok([rel('a'), rel('b'), rel('c', { subscription: sub({ endAt: now - DAY }) }), rel('d')]),
        checkIns: ok([
          { clientId: 'a', latest: ci('a', { status: 'submitted', submittedAt: now - DAY }), previous: null },
          { clientId: 'b', latest: null, previous: null },
          { clientId: 'c', latest: null, previous: null },
          { clientId: 'd', latest: ci('d', { coachId: 'coach-old', status: 'submitted' }), previous: null }, // a previous coach's: not mine
        ]),
      }),
    );
    renderAt('/coach/clients?view=checkins');
    expect(within(screen.getByTestId('checkins-group-review')).getAllByTestId('checkins-row').map((r) => r.dataset.clientId)).toEqual(['a']);
    expect(within(screen.getByTestId('checkins-group-notRequested')).getAllByTestId('checkins-row').map((r) => r.dataset.clientId).sort()).toEqual(['b', 'c', 'd']);
    const button = screen.getByTestId('checkins-request-week');
    expect(button).toHaveTextContent('(2)'); // b and d — c's package ran out
    fireEvent.click(button);
    fireEvent.click(await screen.findByTestId('confirm-accept'));
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(2));
    expect(h.request.mock.calls.map((c) => (c as unknown[])[1]).sort()).toEqual(['b', 'd']);
    expect((h.request.mock.calls[0] as unknown[])[2]).toBe(WEEK);
    await act(async () => undefined);
    expect(screen.getByTestId('start-review-queue')).toHaveTextContent('(1)');
  });
});
