import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenState, queryScreen, screenStatus } from './ScreenState';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
afterEach(() => setOnline(true));

describe('screen-state model (B1.5)', () => {
  it('data on screen is never replaced by an error or offline — only marked stale', () => {
    expect(screenStatus({ loading: false, error: true, hasData: true, online: true })).toEqual({ status: 'ready', stale: true });
    expect(screenStatus({ loading: true, hasData: true, online: false })).toEqual({ status: 'ready', stale: true });
    expect(screenStatus({ loading: false, hasData: true, online: true })).toEqual({ status: 'ready', stale: false });
  });

  it('no data: offline is offline (never a false "empty"), then error, then loading, then empty', () => {
    expect(screenStatus({ loading: true, hasData: false, online: false }).status).toBe('offline');
    expect(screenStatus({ loading: false, error: true, hasData: false, online: false }).status).toBe('offline');
    expect(screenStatus({ loading: false, error: true, hasData: false, online: true }).status).toBe('error');
    expect(screenStatus({ loading: true, hasData: false, online: true }).status).toBe('loading');
    expect(screenStatus({ loading: false, hasData: true, empty: true, online: true }).status).toBe('empty');
  });

  it('renders the matching state', () => {
    setOnline(false);
    const { rerender } = render(<ScreenState loading hasData={false} testId="list">rows</ScreenState>);
    expect(screen.getByTestId('list-offline')).toBeTruthy();
    setOnline(true);
    rerender(<ScreenState loading={false} hasData empty emptyTitle="No clients yet" testId="list2">rows</ScreenState>);
    expect(screen.getByTestId('list2-empty').textContent).toContain('No clients yet');
    rerender(<ScreenState loading={false} error hasData testId="list3">rows</ScreenState>);
    expect(screen.getByText('rows')).toBeTruthy();
    expect(screen.getByTestId('stale-notice')).toBeTruthy();
  });
});

/** B3.9 (CO-18 / PF-21): React Query PAUSES a fetch it thinks can't reach the network — that is offline, never an endless skeleton. */
describe('paused reads (B3.9)', () => {
  const q = (over: Partial<Parameters<typeof queryScreen>[0]> = {}) => ({ data: undefined, isPending: true, isError: false, fetchStatus: 'idle' as const, refetch: () => undefined, ...over });

  it('a paused read with nothing on this device is offline, even while the browser reports online', () => {
    expect(screenStatus({ loading: false, hasData: false, online: true, paused: true })).toEqual({ status: 'offline', stale: false });
    expect(screenStatus({ loading: false, hasData: true, online: true, paused: true })).toEqual({ status: 'ready', stale: true });
  });

  it('queryScreen maps a React Query result: paused is not loading; a real fetch is', () => {
    const paused = queryScreen(q({ fetchStatus: 'paused' }));
    expect(paused).toMatchObject({ loading: false, paused: true, hasData: false });
    expect(screenStatus({ ...paused, online: true }).status).toBe('offline');
    const fetching = queryScreen(q({ fetchStatus: 'fetching' }));
    expect(screenStatus({ ...fetching, online: true }).status).toBe('loading');
    const failed = queryScreen(q({ isPending: false, isError: true }));
    expect(screenStatus({ ...failed, online: true }).status).toBe('error');
  });

  it('queryScreen: isEmpty decides "loaded, nothing there"; Retry refetches', () => {
    let refetched = 0;
    const empty = queryScreen<number[]>(q({ data: [] as number[], isPending: false, refetch: () => (refetched += 1) }) as Parameters<typeof queryScreen<number[]>>[0], (d) => d.length === 0);
    expect(screenStatus({ ...empty, online: true }).status).toBe('empty');
    empty.onRetry();
    expect(refetched).toBe(1);
  });

  it('renders offline for a paused read', () => {
    render(<ScreenState loading={false} hasData={false} paused testId="paused">rows</ScreenState>);
    expect(screen.getByTestId('paused-offline')).toBeTruthy();
  });
});
