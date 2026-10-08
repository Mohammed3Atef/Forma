import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const getCheckIn = vi.fn();
const submitCheckIn = vi.fn();
vi.mock('@/services/platform/checkInApi', () => ({
  getCheckIn: (...a: unknown[]) => getCheckIn(...a),
  submitCheckIn: (...a: unknown[]) => submitCheckIn(...a),
}));
vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false }));

import { CheckIn } from './CheckIn';
import { useSession } from '@/services/auth/sessionStore';
import { hasNavGuard } from '@/stores/navGuardStore';
import type { UserRecord } from '@/types';

const requested = { id: '2026-09-28', clientId: 'client-1', weekStart: '2026-09-28', weekEnd: '2026-10-04', status: 'requested', progressPhotos: {} };

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/check-in/2026-09-28']}>
        <Routes>
          <Route path="/check-in/:id" element={<CheckIn />} />
          <Route path="/check-ins" element={<p>history</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const next = () => fireEvent.click(screen.getByTestId('checkin-next'));

beforeEach(() => {
  localStorage.clear();
  getCheckIn.mockReset();
  submitCheckIn.mockReset();
  getCheckIn.mockResolvedValue(requested);
  useSession.setState({ phase: 'ready', uid: 'client-1', account: { id: 'client-1', role: 'client' } as UserRecord });
});

describe('check-in task flow (CL-42 / JR-05)', () => {
  it('a failed load is an error with Retry, never "not found" (B0.16)', async () => {
    getCheckIn.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(requested);
    mount();
    expect(await screen.findByTestId('checkin-load-error')).toBeTruthy();
    expect(screen.queryByTestId('checkin-next')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(await screen.findByTestId('checkin-next')).toBeTruthy();
  });

  it('is a full-screen layer with the action pinned outside the scrolling body', async () => {
    mount();
    const flow = await screen.findByTestId('checkin-flow');
    expect(flow.className).toMatch(/\bfixed\b/);
    expect(flow.className).toMatch(/inset-0/);
    const actions = screen.getByTestId('checkin-actions');
    expect(actions).toContainElement(screen.getByTestId('checkin-next'));
    expect(screen.getByTestId('checkin-body')).not.toContainElement(screen.getByTestId('checkin-next'));
  });

  it('answers and the current step survive leaving / reloading, and resume', async () => {
    const first = mount();
    await screen.findByTestId('checkin-flow');
    next(); // → training
    next(); // → nutrition
    expect(screen.getByTestId('checkin-nutrition')).toBeInTheDocument();
    first.unmount();
    mount();
    expect(await screen.findByTestId('checkin-nutrition')).toBeInTheDocument(); // resumed at step 3
  });

  it('leaving mid-flow asks first (answers stay saved)', async () => {
    mount();
    await screen.findByTestId('checkin-flow');
    expect(hasNavGuard()).toBe(false);
    next();
    await waitFor(() => expect(hasNavGuard()).toBe(true));
  });

  it('a double tap on Submit sends exactly one check-in', async () => {
    let resolve!: (v: unknown) => void;
    submitCheckIn.mockImplementation(() => new Promise((r) => (resolve = r)));
    mount();
    await screen.findByTestId('checkin-flow');
    next();
    next();
    next();
    const submit = screen.getByTestId('checkin-submit');
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(submitCheckIn).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    await new Promise((r) => setTimeout(r, 20));
    expect(submitCheckIn).toHaveBeenCalledTimes(1);
    getCheckIn.mockResolvedValue({ ...requested, status: 'submitted' });
    resolve({});
    await waitFor(() => expect(localStorage.getItem('forma.checkinDraft.v1.client-1.2026-09-28')).toBeNull());
  });

  it('a failed submit says so and keeps every answer', async () => {
    submitCheckIn.mockRejectedValue(new Error('500 {"raw":true}'));
    mount();
    await screen.findByTestId('checkin-flow');
    next();
    next();
    next();
    fireEvent.change(screen.getByTestId('checkin-notes'), { target: { value: 'Knee felt better' } });
    fireEvent.click(screen.getByTestId('checkin-submit'));
    expect(await screen.findByTestId('checkin-error')).toBeInTheDocument();
    expect(screen.queryByText(/raw/)).toBeNull();
    expect(screen.getByDisplayValue('Knee felt better')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('forma.checkinDraft.v1.client-1.2026-09-28')!).form.notes).toBe('Knee felt better');
  });
});
