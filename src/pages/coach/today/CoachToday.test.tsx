import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CoachClientRelationship, WeeklyCheckIn } from '@/types';
import type { SourceState, TodaySources } from '@/lib/coachToday';

/**
 * B3.2 Today screen: the states are distinct and honest (loading / error /
 * offline / stale / empty never read as "all caught up"), every row opens
 * its exact place, a check-in is reviewed in place, desktop has the panel.
 */
const h = vi.hoisted(() => ({
  data: null as unknown as { sources: TodaySources; updatedAt: number; refreshing: boolean; refresh: () => void },
  desktop: false,
  online: true,
  review: vi.fn(async () => undefined),
}));
vi.mock('@/hooks/useCoachSources', () => ({ useCoachSources: () => h.data }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsDesktop: () => h.desktop, useIsTabletUp: () => h.desktop, useMediaQuery: () => h.desktop }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
vi.mock('@/components/coach/ClientContextPanel', () => ({ ClientContextPanel: () => null }));
vi.mock('@/services/platform/coachPlanApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachPlanApi')>()),
  coachPlanQuery: () => ({ queryKey: ['coachPlan', 'c'], queryFn: async () => null }),
}));
vi.mock('@/services/platform/coachAssetsApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/coachAssetsApi')>()), listWorkoutTemplates: async () => [] }));
vi.mock('@/services/platform/checkInApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/checkInApi')>()), reviewCheckIn: h.review }));

import { useSession } from '@/services/auth/sessionStore';
import { DialogHost } from '@/components/DialogHost';
import { CoachToday } from './CoachToday';

const COACH = 'coach-1';
const DAY = 86_400_000;
const now = Date.now();
const ok = <T,>(data: T): SourceState<T> => ({ data, error: false });
const none = <T,>(error = false): SourceState<T> => ({ data: undefined, error });

const rel = (clientId: string, over: Partial<CoachClientRelationship> = {}): CoachClientRelationship => ({
  id: `${COACH}__${clientId}`,
  coachId: COACH,
  clientId,
  status: 'active',
  createdBy: COACH,
  createdAt: now - 30 * DAY,
  updatedAt: now,
  subscription: { status: 'active', startAt: now - 10 * DAY, endAt: now + 20 * DAY, updatedAt: now },
  ...over,
});
const checkIn = (clientId: string): WeeklyCheckIn => ({ id: '2026-10-11', clientId, coachId: COACH, weekStart: '2026-10-11', weekEnd: '2026-10-17', status: 'submitted', submittedAt: now - DAY, currentWeight: 70, progressPhotos: {}, createdAt: now - 2 * DAY, updatedAt: now });

function sources(ids: string[], over: Partial<TodaySources> = {}): TodaySources {
  return {
    roster: ok(ids.map((id) => ({ id, displayName: `Client ${id.toUpperCase()}`, email: `${id}@x.test`, accountStatus: 'active' }))),
    relationships: ok(ids.map((id) => rel(id))),
    summaries: ok(ids.map((id) => ({ clientId: id, lastActivity: new Date(now).toISOString().slice(0, 10), assessment: 'reviewed' as const, hasWorkoutPlan: true, hasNutritionPlan: true }))),
    checkIns: ok(ids.map((id) => ({ clientId: id, latest: null, previous: null }))),
    threads: ok(ids.map((id) => ({ clientId: id, unreadForCoach: 0, last: null }))),
    transfers: ok([]),
    freezeRequests: ok([]),
    ...over,
  };
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function renderToday(path = '/coach/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coach/dashboard" element={<><CoachToday /><Where /><DialogHost /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const refresh = vi.fn();
function setData(s: TodaySources, updatedAt = now - 60_000) {
  h.data = { sources: s, updatedAt, refreshing: false, refresh };
}

beforeEach(() => {
  h.desktop = false;
  h.online = true;
  refresh.mockReset();
  h.review.mockClear();
  useSession.setState({ uid: COACH, account: { id: COACH, role: 'coach', accountStatus: 'active', displayName: 'Amira Coach', email: 'amira@x.test' } as never });
});

describe('CoachToday — states', () => {
  it('loading: a skeleton, no summary claim', () => {
    setData(sources([], { roster: none() }));
    renderToday();
    expect(screen.getByTestId('today-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('today-all-clear')).toBeNull();
  });

  it('the roster failing: an error with Retry online, the offline state offline — never "all caught up"', () => {
    setData(sources([], { roster: none(true) }));
    const { unmount } = renderToday();
    expect(screen.getByTestId('today-error')).toBeInTheDocument();
    unmount();
    h.online = false;
    renderToday();
    expect(screen.getByTestId('today-offline')).toBeInTheDocument();
    expect(screen.queryByTestId('today-all-clear')).toBeNull();
  });

  it('a new coach (no clients): welcome + Add client, not a queue', () => {
    setData(sources([]));
    renderToday();
    expect(screen.getByTestId('today-new-coach')).toHaveTextContent('Welcome, Amira');
    fireEvent.click(screen.getByTestId('today-add-client'));
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/clients?new=1');
  });

  it('everything loaded and nothing waiting: "You\'re all caught up"', () => {
    setData(sources(['a']));
    renderToday();
    expect(screen.getByTestId('today-all-clear')).toHaveTextContent("You're all caught up");
    expect(screen.queryByTestId('today-summary')).toBeNull(); // said once, by the card
  });

  it('one source failed: its error line with Retry, and no "all caught up"', () => {
    setData(sources(['a'], { checkIns: none(true) }));
    renderToday();
    expect(screen.queryByTestId('today-all-clear')).toBeNull();
    expect(screen.getByTestId('today-summary')).toHaveTextContent("Some of your queue couldn't load");
    const err = screen.getByTestId('today-kind-error');
    expect(err).toHaveTextContent("Couldn't load check-ins.");
    fireEvent.click(within(err).getByRole('button'));
    expect(refresh).toHaveBeenCalled();
  });

  it('a failed refresh over loaded data: marked stale, and an empty queue says "as of", not "caught up"', () => {
    const s = sources(['a']);
    s.summaries = { ...s.summaries, error: true };
    setData(s);
    renderToday();
    expect(screen.getByTestId('today-stale')).toHaveTextContent("Couldn't refresh");
    expect(screen.queryByTestId('today-all-clear')).toBeNull();
    expect(screen.getByTestId('today-empty-stale')).toBeInTheDocument();
  });

  it('offline with a cached queue: says offline and from when', () => {
    h.online = false;
    setData(sources(['a']));
    renderToday();
    expect(screen.getByTestId('today-stale')).toHaveTextContent("You're offline");
    expect(screen.queryByTestId('today-all-clear')).toBeNull();
  });
});

describe('CoachToday — the queue', () => {
  function busy() {
    return sources(['a', 'b', 'c'], {
      threads: ok([{ clientId: 'a', unreadForCoach: 2, last: { body: 'Can we move Friday?', fromRole: 'client', createdAt: now - 3600_000 } }]),
      summaries: ok([
        { clientId: 'a', lastActivity: null, assessment: 'reviewed', hasWorkoutPlan: true, hasNutritionPlan: true },
        { clientId: 'b', lastActivity: null, assessment: 'submitted', hasWorkoutPlan: true, hasNutritionPlan: true },
        { clientId: 'c', lastActivity: null, assessment: 'reviewed', hasWorkoutPlan: true, hasNutritionPlan: true },
      ]),
      relationships: ok([rel('a', { createdAt: now - DAY }), rel('b', { createdAt: now - DAY }), rel('c', { createdAt: now - DAY, subscription: { status: 'active', startAt: now - 25 * DAY, endAt: now + 2 * DAY, updatedAt: now } })]),
      checkIns: ok([{ clientId: 'c', latest: checkIn('c'), previous: null }]),
    });
  }

  it('rows read who · why · action, sections in priority order, the summary counts them', () => {
    setData(busy());
    renderToday();
    expect(screen.getByTestId('today-summary')).toHaveTextContent('4 things need you');
    const rows = screen.getAllByTestId('today-item');
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['checkin', 'assessment', 'message', 'renewal']);
    expect(rows[2]).toHaveTextContent('Client A');
    expect(rows[2]).toHaveTextContent('2 unread messages');
    expect(rows[2]).toHaveTextContent('Can we move Friday?'); // the client's words, bidi-isolated
    expect(rows[3]).toHaveTextContent('Package ends in 2 days');
    expect(within(rows[0]).getByTestId('today-item-action')).toHaveTextContent('Review');
  });

  it('phones: a row opens its exact place (assessment, thread, subscription)', () => {
    setData(busy());
    const { unmount } = renderToday();
    fireEvent.click(screen.getAllByTestId('today-item').find((r) => r.dataset.kind === 'message')!);
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/messages/a');
    unmount();
    renderToday();
    fireEvent.click(screen.getAllByTestId('today-item').find((r) => r.dataset.kind === 'assessment')!);
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/client/b/assessment');
  });

  it('phones: a check-in opens the review sheet; empty feedback asks first; reviewing calls the server for that week', async () => {
    setData(busy());
    renderToday();
    fireEvent.click(screen.getAllByTestId('today-item').find((r) => r.dataset.kind === 'checkin')!);
    expect(await screen.findByTestId('checkin-review')).toBeInTheDocument();
    // Empty feedback: asks first; Cancel sends nothing.
    fireEvent.click(screen.getByTestId('review-mark-next'));
    fireEvent.click(await screen.findByTestId('confirm-cancel'));
    expect(h.review).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('review-feedback'), { target: { value: 'Great week — keep the deficit.' } });
    fireEvent.click(screen.getByTestId('review-mark-next'));
    await waitFor(() => expect(h.review).toHaveBeenCalledWith('c', '2026-10-11', 'Great week — keep the deficit.'));
  });

  it('desktop: rows select, the panel shows the selected item with its action, J / K move', () => {
    h.desktop = true;
    setData(busy());
    renderToday();
    const panel = screen.getByTestId('today-panel');
    expect(within(panel).getByTestId('today-detail')).toHaveAttribute('data-kind', 'checkin');
    act(() => void fireEvent.keyDown(window, { key: 'j' }));
    expect(within(panel).getByTestId('today-detail')).toHaveAttribute('data-kind', 'assessment');
    expect(within(panel).getByTestId('today-detail-primary')).toHaveAttribute('href', '/coach/client/b/assessment');
    fireEvent.click(screen.getAllByTestId('today-item').find((r) => r.dataset.kind === 'renewal')!);
    expect(within(panel).getByTestId('today-detail')).toHaveAttribute('data-kind', 'renewal');
    expect(within(panel).getByTestId('today-detail-primary')).toHaveAttribute('href', '/coach/client/c/subscription');
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/dashboard'); // selecting never navigates
  });

  it('chips filter by kind (?focus) and "Show everything" clears it; the legacy ?focus=assessments works', () => {
    setData(busy());
    const { unmount } = renderToday();
    fireEvent.click(screen.getByTestId('today-chip-message'));
    expect(screen.getByTestId('where')).toHaveTextContent('focus=message');
    expect(screen.getAllByTestId('today-item').map((r) => r.dataset.kind)).toEqual(['message']);
    fireEvent.click(screen.getByTestId('today-chip-all'));
    expect(screen.getAllByTestId('today-item')).toHaveLength(4);
    unmount();
    renderToday('/coach/dashboard?focus=assessments');
    expect(screen.getAllByTestId('today-item').map((r) => r.dataset.kind)).toEqual(['assessment']);
  });

  it('many clients: a section shows 5 rows, then "Show N more"', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `m${i}`);
    setData(sources(ids, { threads: ok(ids.map((id, i) => ({ clientId: id, unreadForCoach: 1, last: { body: 'hi', fromRole: 'client', createdAt: now - i * 1000 } }))) }));
    renderToday();
    expect(screen.getAllByTestId('today-item')).toHaveLength(5);
    fireEvent.click(screen.getByTestId('today-more-messages'));
    expect(screen.getAllByTestId('today-item')).toHaveLength(8);
    expect(screen.getByTestId('today-summary')).toHaveTextContent('8 things need you');
  });
});
