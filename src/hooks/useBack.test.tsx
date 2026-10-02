import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { canGoBackInApp, useBack } from './useBack';

/**
 * R-20 / R-4: back must fall back to a fixed route when this is the first
 * entry of the document — including after a `replace` navigation (the
 * workspace tab rail), which used to be mistaken for "has history" and
 * called navigate(-1) off the site.
 */

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
function BackButton() {
  const back = useBack('/fallback');
  return (
    <button type="button" onClick={back}>
      back
    </button>
  );
}
function ReplaceTab() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/tab2', { replace: true })}>
      tab
    </button>
  );
}

describe('canGoBackInApp', () => {
  it('reads react-router history idx (0 = first entry)', () => {
    window.history.replaceState({ idx: 0 }, '');
    expect(canGoBackInApp()).toBe(false);
    window.history.replaceState({ idx: 3 }, '');
    expect(canGoBackInApp()).toBe(true);
    window.history.replaceState(null, '');
    expect(canGoBackInApp()).toBe(false);
  });
});

describe('useBack', () => {
  it('deep link + replace navigation → falls back instead of leaving the app', async () => {
    window.history.replaceState({ idx: 0 }, '');
    render(
      <MemoryRouter initialEntries={['/tab1']}>
        <Routes>
          <Route path="/tab1" element={<><ReplaceTab /><Where /></>} />
          <Route path="/tab2" element={<><BackButton /><Where /></>} />
          <Route path="/fallback" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('tab'));
    expect(screen.getByTestId('where')).toHaveTextContent('/tab2');
    fireEvent.click(screen.getByText('back'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/fallback'));
  });
});
