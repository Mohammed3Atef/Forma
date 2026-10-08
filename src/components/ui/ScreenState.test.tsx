import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenState, screenStatus } from './ScreenState';

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
