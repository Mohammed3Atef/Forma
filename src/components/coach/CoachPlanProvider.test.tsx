import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CoachPlan } from '@/types';

/**
 * B3.8 owner D5 / D6: one capacity count — the server's maintained counter, the number that gates a
 * new client — on every coach surface, and a plan state taken from the server's `state` / `phase`
 * (never the legacy tier field `plan.plan`), with an end date that passed since the read folded in.
 */
const h = vi.hoisted(() => ({ plan: null as unknown as Partial<CoachPlan> | null, pending: false, reads: 0 }));
vi.mock('@/services/platform/coachPlanApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachPlanApi')>()),
  coachPlanQuery: (id: string | undefined) => ({
    queryKey: ['coachPlan', id],
    queryFn: () => {
      h.reads += 1;
      return h.pending ? new Promise(() => undefined) : Promise.resolve(h.plan);
    },
    enabled: !!id,
  }),
}));

import { useSession } from '@/services/auth/sessionStore';
import { coachPlanState } from '@/services/platform/coachPlanApi';
import { CoachPlanProvider, useCapacityFollowsRoster, useCoachCapacity, useCoachPlan, useWriteGate } from './CoachPlanProvider';
import { emitPlanLapsed } from '@/services/platform/planLapseSignal';
import { act } from '@testing-library/react';

const DAY = 86_400_000;
const plan = (p: Partial<CoachPlan>): Partial<CoachPlan> => ({ coachId: 'coach-1', phase: 'forma', state: 'active', status: 'active', maxClients: 25, activeClientCount: 0, endsAt: Date.now() + 20 * DAY, ...p });

function Probe() {
  const c = useCoachCapacity();
  const { state, canWrite } = useCoachPlan();
  return <pre data-testid="probe">{JSON.stringify({ ...c, state, canWrite })}</pre>;
}
const read = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}');
async function renderWith(p: Partial<CoachPlan> | null, settle = true) {
  h.plan = p;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CoachPlanProvider>
        <Probe />
      </CoachPlanProvider>
    </QueryClientProvider>,
  );
  if (settle) await waitFor(() => expect(read().known).toBe(true));
}

beforeEach(() => {
  h.pending = false;
  useSession.setState({ uid: 'coach-1', account: { id: 'coach-1', role: 'coach', accountStatus: 'active', email: 'c@x.test' } as never });
});

describe('capacity — the server’s count everywhere (D5)', () => {
  it('uses the maintained counter (a disabled client still holds a slot on the server)', async () => {
    await renderWith(plan({ maxClients: 3, activeClientCount: 3 }));
    expect(read()).toMatchObject({ used: 3, limit: 3, over: 0, remaining: 0, atLimit: true, nearLimit: true, lapsed: false });
  });

  it('over capacity says by how much', async () => {
    await renderWith(plan({ maxClients: 3, activeClientCount: 4 }));
    expect(read()).toMatchObject({ used: 4, over: 1, atLimit: true });
  });

  it('a plan without the counter reads 0 — what the server gates on', async () => {
    await renderWith(plan({ maxClients: 2, activeClientCount: undefined }));
    expect(read()).toMatchObject({ used: 0, atLimit: false, remaining: 2 });
  });

  it('a lapsed plan blocks new clients even under the limit', async () => {
    await renderWith(plan({ state: 'expired', activeClientCount: 1 }));
    expect(read()).toMatchObject({ atLimit: true, lapsed: true, canWrite: false });
  });

  it('nothing is full or blocked while the plan loads', async () => {
    h.pending = true;
    await renderWith(null, false);
    expect(read()).toMatchObject({ known: false, atLimit: false, over: 0 });
  });
});

describe('plan state — the server’s, never the legacy tier field (D6)', () => {
  it('the server’s state wins over a contradicting legacy `plan` value', async () => {
    await renderWith(plan({ plan: 'forma' as never, phase: 'trial', state: 'trial' }));
    expect(read().state).toBe('trial');
  });

  it('an end date that passed since the read folds into "expired"; suspended and none stay', () => {
    const now = Date.now();
    expect(coachPlanState({ state: 'active', endsAt: now - 1 }, now)).toBe('expired');
    expect(coachPlanState({ state: 'trial', endsAt: now - 1 }, now)).toBe('expired');
    expect(coachPlanState({ state: 'active', endsAt: now + DAY }, now)).toBe('active');
    expect(coachPlanState({ state: 'suspended', endsAt: now - 1 }, now)).toBe('suspended');
    expect(coachPlanState({ state: 'active', endsAt: null }, now)).toBe('active');
    expect(coachPlanState(null, now)).toBe('none');
  });
});

describe('the count follows the roster (D5)', () => {
  function Follow({ size }: { size: number | undefined }) {
    useCapacityFollowsRoster(size);
    return <Probe />;
  }
  it('reads the plan again when the roster changes size — not on the first load, not when it stays the same', async () => {
    h.plan = plan({ activeClientCount: 2 });
    h.reads = 0;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const ui = (size: number | undefined) => (
      <QueryClientProvider client={qc}>
        <CoachPlanProvider>
          <Follow size={size} />
        </CoachPlanProvider>
      </QueryClientProvider>
    );
    const v = render(ui(undefined));
    await waitFor(() => expect(read().used).toBe(2));
    v.rerender(ui(2));
    v.rerender(ui(2));
    expect(h.reads).toBe(1);
    h.plan = plan({ activeClientCount: 3 });
    v.rerender(ui(3));
    await waitFor(() => expect(read().used).toBe(3));
    expect(h.reads).toBe(2);
  });
});

describe('P2 — a lapsed Forma plan makes the coach app read-only (B3.8)', () => {
  function GateProbe() {
    const g = useWriteGate();
    return <pre data-testid="gate">{JSON.stringify(g)}</pre>;
  }
  const gate = () => JSON.parse(screen.getByTestId('gate').textContent ?? '{}');
  async function renderGate(p: Partial<CoachPlan> | null) {
    h.plan = p;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CoachPlanProvider>
          <GateProbe />
        </CoachPlanProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(h.reads).toBeGreaterThan(0));
  }

  it('the write gate says why: a lapsed plan blocks every write, with the read-only sentence', async () => {
    await renderGate(plan({ state: 'expired', endsAt: Date.now() - DAY }));
    await waitFor(() => expect(gate().planBlocked).toBe(true));
    expect(gate()).toMatchObject({ canWrite: false, planBlocked: true });
    expect(gate().reason).toMatch(/read-only mode/);
  });

  it('a suspended plan says so', async () => {
    await renderGate(plan({ state: 'suspended', status: 'suspended' }));
    await waitFor(() => expect(gate().planBlocked).toBe(true));
    expect(gate().reason).toMatch(/suspended/);
  });

  it('a running plan writes; it turns read-only by itself the moment its term ends in an open app', async () => {
    await renderGate(plan({ endsAt: Date.now() + 300 }));
    await waitFor(() => expect(gate().canWrite).toBe(true));
    await waitFor(() => expect(gate().planBlocked).toBe(true), { timeout: 2000 });
  });

  it('B38F-R3: a coach the server says has NO plan is read-only too, with its own sentence — never while the plan is still loading', async () => {
    h.pending = true;
    await renderGate(null);
    expect(gate()).toMatchObject({ canWrite: true, planBlocked: false }); // loading: never locked mid-load
    cleanup();
    h.pending = false;
    await renderGate(null);
    await waitFor(() => expect(gate().planBlocked).toBe(true));
    expect(gate().canWrite).toBe(false);
    expect(gate().reason).toMatch(/don't have a Forma plan yet/);
  });

  it('a refusal for a missing plan (NO_SUBSCRIPTION) also makes the app read the plan again', async () => {
    await renderGate(plan({}));
    await waitFor(() => expect(gate().canWrite).toBe(true));
    const before = h.reads;
    h.plan = null;
    act(() => emitPlanLapsed('NO_SUBSCRIPTION'));
    await waitFor(() => expect(h.reads).toBeGreaterThan(before));
    await waitFor(() => expect(gate().planBlocked).toBe(true));
  });

  it('a write the server refused for a lapsed plan makes the app read the plan again at once', async () => {
    await renderGate(plan({}));
    await waitFor(() => expect(gate().canWrite).toBe(true));
    const before = h.reads;
    h.plan = plan({ state: 'expired', endsAt: Date.now() - 1000 });
    act(() => emitPlanLapsed('SUBSCRIPTION_EXPIRED'));
    await waitFor(() => expect(h.reads).toBeGreaterThan(before));
    await waitFor(() => expect(gate().planBlocked).toBe(true));
  });
});
